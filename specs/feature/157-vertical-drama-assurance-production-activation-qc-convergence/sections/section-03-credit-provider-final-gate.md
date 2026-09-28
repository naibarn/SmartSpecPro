# Section 03 — Credit, Provider Authorization, and Final-Gate Convergence

## Purpose and delivery boundary

This section makes every Vertical Drama model call, retry, fallback, and paid
provider submission attributable to one logical assurance attempt without
creating a second wallet, a second provider-task owner, or a second retry
engine. It prevents duplicate user deductions and duplicate provider tasks,
keeps deterministic no-op work free, assigns shadow cost to the platform, and
turns uncertain usage or provider acceptance into durable reconciliation rather
than a blind refund or replay.

Implementation begins only after Section 01 has established the versioned
assurance request/result, source/context fingerprints, task mapping, and stable
readiness vocabulary. It consumes the durable attempt/event/reconciliation
owner selected by Section 02. This section blocks Draft QC activation, Agent
Runtime integration, prompt/media adapters, operational rollout, and final
production proof in Sections 04, 06, 07, 09, and 10.

This is a policy-and-integration section. Candidate content remains in the
existing Vertical Drama ledgers. User balances and financial transactions
remain in `creditService` and `credit_transactions`. Paid image/video tasks and
terminal media reconciliation remain with the existing media generation/task
owner. The Agent Runtime may report usage but may never deduct credits or
submit paid media on behalf of those owners.

## Current-state facts that implementation must preserve or correct

- `verticalDramaDraftQualityQc.ts` already reserves an upper bound through
  `createCreditReservation`, draws actual call cost through
  `drawFromReservation`, and refunds unused credit through
  `refundReservation`. Draft QC and explicit Draft Repair therefore already
  have a domain billing owner; the assurance work must enrich and harden that
  path rather than add another charge.
- The current reservation record is held in Redis with a ten-minute TTL after
  the full amount is deducted. Drawn-call identity is not durable on its own,
  so Redis expiry or a crash between a draw and result persistence cannot be
  treated as sufficient exact-once proof.
- `verticalDramaPromptQc.ts` currently performs direct post-call deductions and
  may make a second strict refinement attempt. Its shared JSON helper can also
  retry schema, transient, model, or provider attempts. The final accepted
  response alone is therefore not a complete physical-call ledger.
- `executeJsonPlanningCallWithRetry` delegates physical provider routing to
  `executeWithFallback`. Optional instrumentation must observe every network
  attempt at that lower boundary; counting only the outer helper invocation
  would undercount schema, transport, model, or provider fallback calls.
- `orchestraFinalGate.ts` currently checks readiness, contract hash, blocking
  findings, prompt length, authorization binding, and expiry. The shared
  authorization contract contains a token ID and nonce, but the current pure
  validator does not durably consume either value and does not bind the token
  to an assurance attempt, source/context fingerprint, provider profile, or
  provider idempotency key.
- `media.ts` and its media generation/task services remain the authority for
  image/video credit reservation or debit, provider submission, provider task
  IDs, terminal refund/charge adjustment, and managed output. Assurance may
  authorize that owner to submit; it must not charge the same operation again.

These facts are regression constraints. A replacement path is unacceptable if
it loses current idempotency behavior, changes provider selection, makes old
callers require new fields while flags are off, or relies on Redis as the only
financial recovery record.

## Billing ownership decision

The billing owner is fixed by operation, not selected dynamically by runtime
mode. Later sections must consume this matrix and may not assign billing to the
Agent Runtime.

| Operation or adapter | Sole billing owner | Payer and settlement rule |
| --- | --- | --- |
| Canonical hash, deterministic preflight/post-validation, replay, CAS, and an already-within-limit prompt | none | Zero cost; create neither reservation nor user credit transaction. A zero-cost assurance event is sufficient. |
| Draft QC baseline, bounded automatic repair, and re-evaluation | `verticalDramaDraftQualityQc.ts` through the assurance billing coordinator and existing `creditService` reservation APIs | User-paid. Reserve the complete bounded call budget once, settle each physical call once, and refund only proven unused credit. |
| Explicit Draft QC Repair | `verticalDramaDraftQualityQc.ts` through the same coordinator under a new logical attempt | User-paid. It cannot reuse the original run's reservation or call IDs. |
| Image/video prompt refinement in `verticalDramaPromptQc.ts` | `verticalDramaPromptQc.ts` through the same coordinator | User-paid only when a model network call occurs. Replace uncorrelated post-success deductions with reserved, per-call settlement while preserving the free no-op path. |
| Active Agent proposal/evaluation for Draft, Prompt, Story, Season, or B-roll QC | the calling Node domain adapter through the assurance billing coordinator | The Agent Runtime reports provider/model/usage only. It never makes a second deduction. Story/season work retains its existing Node domain payer when Section 07 connects it. |
| Legacy deterministic/JSON fallback after an active Agent call | the same domain billing owner as the primary call | User-paid only when the attempt budget explicitly includes fallback. Primary and fallback are separate physical calls and are reconciled independently. |
| Live shadow comparison | platform shadow budget | Never deduct, reserve, or refund user credits. Persist estimated and actual platform-owned cost for observability. If no platform budget is available, use a fixture or skip the live shadow call with an explicit reason. |
| Paid image/video/provider submission | existing media credit and provider-task owner | The assurance layer supplies readiness and a one-time authorization. The media owner performs the one and only reservation/debit, submission, and terminal reconciliation. |
| Redacted replay and fault fixture | none | No network call and no financial side effect. |

`billingOwner` and `payer` are durable facts. Runtime mode, provider fallback,
or queue redelivery cannot change them after admission. Estimated cost is never
reported as an actual debit. Platform-owned shadow cost is never mixed into a
user's cost total or `credit_transactions` history.

## Files and symbols to inspect or change

Implementation should make the smallest additive changes after rechecking the
current symbols at the start of the section:

- Add `apps/web/server/services/verticalDramaAssuranceBilling.ts` as a thin
  coordinator over the Section 02 repository and existing `creditService`.
  It owns call registration, reservation references, per-call settlement,
  refund eligibility, and billing projection; it is not a wallet and does not
  calculate a second balance.
- Extend `apps/web/server/services/creditService.ts` only where the shared
  reservation API lacks repeat-safe call settlement. Preserve all existing
  callers. Add optional draw/refund settlement keys, retain the reservation's
  creation idempotency key, and make repeated settlement of one provider call
  return the existing result instead of incrementing drawn credit again.
- Integrate the coordinator into
  `apps/web/server/services/verticalDramaDraftQualityQc.ts` and
  `apps/web/server/services/verticalDramaPromptQc.ts`. Section 04 will consume
  the Draft QC contract; Section 07 will consume the prompt/media contract.
- Add optional physical-attempt accounting hooks to
  `executeJsonPlanningCallWithRetry` in
  `apps/web/server/services/verticalDramaStoryBible.ts` and to the actual
  provider-attempt seam in `apps/web/server/services/llmRouter.ts`. Defaults
  must preserve every unrelated caller. The hook emits metadata and bounded
  usage only; it must never expose prompt or response bodies.
- Extend `apps/web/shared/agentRuntime/orchestraSchemas.ts` additively for the
  provider-authorization binding required below. Legacy authorization remains
  readable, but it cannot authorize a newly enforced paid Vertical Drama
  submission without all new bindings.
- Keep `assertOrchestraFinalGate` in
  `apps/web/server/services/agentRuntime/orchestraFinalGate.ts` as the pure
  validation seam. Add the durable issue/claim/consume operations to the
  Section 02 assurance repository and invoke them through the Node domain
  adapter so the final gate does not become a network or wallet owner.
- Reuse existing media submission and `reconcileTaskCredits` paths in
  `apps/web/server/routers/media.ts` and the media generation/task services.
  Add an internal guarded entry point or required authorization context for
  enabled Vertical Drama calls; do not duplicate the public router logic or
  change unrelated Media Studio behavior.
- Register and default the Feature 157 flags in
  `apps/web/shared/featureFlags.ts` using the repository's existing tenant flag
  conventions. Section 09 owns rollout administration and operational
  documentation; this section owns the billing/provider behavior selected by
  those flags.

Before changing shared `creditService`, the JSON retry helper, `llmRouter`, the
authorization schema, or media submission, run impact analysis when
SocratiCode is available. If it remains unavailable, enumerate callers with
targeted search and prove optional/default compatibility with focused tests.

## Durable call and settlement contract

Every physical network attempt receives an application-owned `providerCallId`
before the request leaves the process. The identifier is distinct from the
logical assurance `attemptId`, an outer retry-helper invocation, a queue job
ID, a provider request ID, and a provider task ID. A single logical attempt may
therefore have several ordered physical calls, each settled independently.

For each call, persist or reference the following facts through the Section 02
durable owner:

| Fact group | Required fields and meaning |
| --- | --- |
| Identity | tenant ID, user ID, domain entity, execution ID, logical attempt ID, provider call ID, call purpose, retry ordinal, and parent/fallback call ID when applicable |
| Input binding | task kind, source fingerprint, context fingerprint, contract hash, policy hash, input hash, and output hash when known |
| Route | assurance mode, billing owner, payer, provider, model, provider profile hash, and whether the call is primary, schema retry, transient retry, model/provider fallback, legacy fallback, shadow, or paid submission |
| Provider correlation | application provider call ID, optional provider request ID, optional provider task ID, provider idempotency key, request-started timestamp, and acceptance evidence |
| Credit correlation | reservation ID, reservation debit transaction ID, per-call settlement key, estimated credits, actual credits when known, draw/refund transaction references, and pricing/model snapshot reference |
| Outcome | planned, in flight, accepted, completed, failed with known non-acceptance, usage unknown, provider acceptance uncertain, or reconciled; include a stable failure/reconciliation code |

No prompt, story text, signed URL, provider credential, raw response, or private
evidence belongs in this record. Provider request IDs and task IDs are
correlation values, not proof of tenant ownership or managed storage.

The retry key is derived from tenant, logical attempt, call purpose, retry
ordinal, provider/model, input hash, and contract/policy version. A UI click or
queue job ID alone is insufficient. The same call settlement key must be used
for every replay of a durable event so a worker restart cannot draw twice.

## Reservation lifecycle

The billing coordinator follows this sequence for a user-paid model adapter:

1. Complete tenant authorization, context/source admission, deterministic
   preflight, and no-op detection before touching credits.
2. Calculate the maximum user-paid credits for all calls permitted by this
   logical attempt. Exclude platform shadow calls. Persist the pricing/model
   snapshot used by the existing calculator; do not duplicate pricing
   formulas in Vertical Drama code.
3. Create one reservation with an idempotency key scoped to tenant, task kind,
   source fingerprint, contract/policy version, and logical attempt. Persist
   the reservation ID and original debit transaction ID on the attempt.
4. Register a physical provider call before dispatch and settle known usage
   against that call's unique settlement key. A malformed, schema-invalid,
   rejected, or timed-out response is still billable exactly once when usage
   evidence proves that the provider ran.
5. Keep `actualCredits` null and mark `pending_reconciliation` when usage is
   unknown. Do not convert the estimate into an actual charge and do not
   silently refund the uncertain amount.
6. After all permitted calls are terminal and known, refund the proven unused
   reservation once. The refund uses a durable idempotency key and links to the
   original reservation transaction.
7. If Redis expires or is unavailable after the initial debit, reconstruct
   intent from the durable attempt, call records, and `credit_transactions`.
   Do not create a replacement reservation or refund from absence alone.

Reservation lifetime must cover the admitted wall-clock/call budget and be
renewed only while the durable lease/fence remains valid. Expiry is a signal to
reconcile, not evidence that no charge exists. A new source fingerprint, task
kind, tenant, provider task, or logical attempt always requires a separate
reservation after the previous one is settled or explicitly left in
reconciliation.

## Retry, fallback, and shadow policy

- Deterministic retries, replay, hashing, and already-satisfied prompt limits
  remain free and do not increment a provider retry ordinal.
- Every schema, transient, provider-candidate, or model rotation that reaches a
  network boundary is a new physical call with its own `providerCallId` and
  settlement. The outer JSON helper may retain its existing bounded retry
  rules, but the assurance budget is the stricter ceiling.
- A user-paid Agent-to-legacy fallback is allowed at most once for the same
  logical input and only when the admitted call count, wall-clock, token, and
  estimated-credit budgets include it. The fallback receives a separate call
  ID and cannot hide or overwrite the primary call's accounting.
- Known primary usage is charged even when fallback produces the accepted
  result. Unknown primary usage remains pending and is reconciled independently
  from known fallback usage.
- Live shadow execution is never a tenant side effect. It cannot activate a
  candidate, submit media, mutate a domain ledger, reserve user credits, or
  affect the response selected for the user. Its estimated/actual cost is
  recorded with `payer = platform` and compared only through redacted hashes,
  findings, latency, and cost metadata.
- Paid image/video submission has no blind provider fallback. If the first
  request may have been accepted, local retries, provider rotation, and
  automatic refunds stop until reconciliation proves a safe next action.
- Queue redelivery resumes the durable call state. It never restarts a model or
  provider call merely because the worker did not acknowledge the job.

## One-time provider authorization

Only the server-side Node domain adapter may issue a paid-side-effect
authorization, and it may do so only after deterministic post-validation has
produced the exact output that will be submitted. The browser and Agent Runtime
may not mint, alter, consume, or forward an arbitrary authorization.

For newly enforced Vertical Drama submissions, the authorization is bound to
all of the following: token ID and nonce; tenant, user, domain owner, execution,
and attempt; exact allowed effect; source and context fingerprints; contract,
policy, input, and output hashes; provider and model; provider capability
profile hash; provider idempotency key; reservation or media billing reference;
expiry; and the current attempt fence. Missing legacy fields may be projected
for inspection but cannot pass an active paid gate.

Authorization state is durable and monotonic: issued, claimed for submission,
accepted with provider correlation, terminal, revoked before submission, or
reconciliation required. Claiming performs an atomic compare-and-set from
unused to claimed under the current fence. Only the winner may invoke the
existing media provider owner. A second worker, replayed event, or repeated API
mutation receives the existing claimed/accepted result and cannot submit.

The provider network call occurs outside the short claim transaction. A crash
after claim but before a definitive non-acceptance result is conservatively
classified as uncertain unless provider/idempotency evidence proves otherwise.
Cancellation before claim may revoke the token and release proven unused
credit. Cancellation after claim fences local activation and enters
reconciliation; it does not automatically refund or issue a replacement token.

When reconciliation proves that no request was accepted, a new one-time token
may be issued under the same logical attempt only if budget and fence are still
current. Reuse the stable provider idempotency key when the provider guarantees
idempotent replay; otherwise require a newly admitted attempt. When acceptance
is proven, attach the provider task ID to the consumed authorization and resume
polling/import rather than resubmitting.

## Authoritative final gates

`assertOrchestraFinalGate` remains a pure prerequisite validator. The Node
domain adapter composes it with current durable state and the atomic
authorization claim. Agent success, a provider response, or a credit debit can
never bypass this composition.

Before `provider_ready` and paid submission, the gate must prove:

- authenticated tenant/user/domain ownership and a current attempt fence;
- result state and disposition are verified at the required readiness;
- source version, source fingerprint, context fingerprint, contract hash,
  policy hash, input hash, and output hash match the current authoritative
  domain state;
- there are no blocking findings, stale dependencies, unresolved rights or
  disclosure requirements, or invalid semantic-role bindings;
- provider/model capability and prompt/provider limits match the exact output;
- the user-paid reservation/media billing reference is valid and sufficient,
  all prior required model-call settlements are known, and no credit
  reconciliation is pending;
- no provider call for the same logical effect is accepted, in flight with
  unknown outcome, or awaiting reconciliation;
- the one-time authorization contains every required binding, permits exactly
  the requested effect, is unexpired, and is atomically claimable once.

Before `production_ready` export, publish, or final assembly, the gate must
additionally prove the paid task is terminal, its durable managed asset exists,
provider and credit reconciliation are complete, the originating fingerprints
and authorization lineage are intact, and the production context/rights/
disclosure/timeline state is still current. A provider URL or an Agent result
alone is not production readiness.

Gate failure returns a stable code and durable next action. Wrong readiness,
missing/consumed authorization, stale fingerprint, insufficient or uncertain
credit, provider uncertainty, and capability mismatch are distinct failures.
None may be collapsed into a generic internal error. Editing, saving,
inspection, and non-paid preview remain available while the unsafe paid or
production transition is blocked.

## Reconciliation and cancellation behavior

The Section 02 reconciler owns leases and state transitions; this section
supplies repeat-safe credit/provider decisions. It resolves by correlation,
never by assuming that timeout, missing Redis state, cancellation, or a lost
HTTP response means failure.

| Durable evidence | Required decision |
| --- | --- |
| No reservation or provider request was created | Retry is safe under the same admission only if the current fence and budget still permit it. |
| Reservation exists and call is proven not sent | Refund proven unused credit once or continue with a registered call under the current attempt. |
| Model call ran and usage is known | Settle that call once even if output was malformed, rejected, or timed out after usage arrived. |
| Model usage is unknown | Keep reserved exposure pending, set `reconciliation_required`, and block final readiness until operator/provider evidence resolves it. |
| Paid provider request is proven not accepted | Settle/refund according to media-owner evidence, then permit a replacement authorization if policy allows. |
| Paid provider request may have been accepted | Freeze resubmission and auto-refund; expose `nextAction = reconcile`. |
| Provider task ID is recovered | Attach it to the original call/authorization and resume status/import through the existing media owner. |
| Credit draw/refund result is uncertain | Query `credit_transactions` by settlement/idempotency key before writing another financial effect. |
| Cancellation occurs after possible acceptance | Fence activation, preserve the task/evidence, and reconcile; cancellation is not financial proof. |

Reconciliation emits append-only events and can run repeatedly. Resolution
must end in a known terminal financial/provider state or remain actionable with
an age metric and operator alert. It must never mutate old call identity or
erase evidence to make totals balance.

## TDD implementation plan

Write the focused tests before changing runtime behavior. Use Vitest and the
repository's existing dependency-injection/mocking patterns. Provider and
credit owners in fault tests are fakes; no test in this section may call a live
provider or spend real credits.

### Billing coordinator and reservation tests

Create
`apps/web/server/services/__tests__/verticalDramaAssuranceBilling.test.ts` and
extend `verticalDramaDraftQualityQc.test.ts` and
`verticalDramaPromptQc.test.ts` with these cases:

- deterministic preflight and an already-within-limit prompt create no
  reservation, no draw, and no user transaction;
- duplicate admission and duplicate worker delivery return one reservation and
  one logical attempt;
- two deliveries of the same `providerCallId` settle one draw, while two real
  physical retries have distinct call IDs and settle independently;
- malformed/schema-invalid output with known usage is charged exactly once;
- timeout with unknown usage remains pending and is neither silently charged
  as the estimate nor refunded;
- reservation, draw, refund, and refund replay remain exact once across Redis
  loss by consulting durable call records and `credit_transactions`;
- reservation expiry during a long call enters reconciliation and does not
  create a replacement debit;
- Draft QC baseline, repair proposal, and re-evaluation keep one domain billing
  owner while recording separate physical calls;
- Prompt QC preserves its zero-cost no-op, reserves only before refinement,
  and accounts for both strict attempts when both reach the provider;
- primary Agent and allowed legacy fallback have separate IDs and costs under
  one logical budget;
- a live shadow call records platform-owned estimated/actual cost, creates no
  user reservation/transaction, and cannot mutate the selected result;
- budget exhaustion prevents the next call before network dispatch and returns
  an actionable bounded outcome.

### Physical call instrumentation tests

Extend focused tests around `executeJsonPlanningCallWithRetry` and
`llmRouter.executeWithFallback` to prove that the optional observer receives a
start and terminal event for every actual provider candidate, including schema
retry, transient retry, model rotation, and provider fallback. Prove every
event has a unique application call ID, stable retry ordinal/input hash, and no
prompt or response body. Prove callers that omit the observer retain their
current return shape, retry limits, logging, and error behavior.

### Authorization and final-gate tests

Extend
`apps/web/shared/agentRuntime/__tests__/assurance.test.ts` and
`apps/web/server/services/agentRuntime/__tests__/orchestraFinalGate.test.ts`,
and add repository/integration tests for durable authorization consumption:

- a token bound to another tenant, user, attempt, source/context fingerprint,
  contract/output/policy hash, provider profile, provider idempotency key, or
  effect is rejected;
- an expired, revoked, already claimed, or stale-fence token is rejected;
- two concurrent claimers produce one winner and one provider invocation;
- wrong readiness, blocking findings, stale output, unresolved credit, provider
  uncertainty, unsupported capability, and prompt limit each fail with their
  specific stable code;
- shadow mode cannot issue or consume a paid authorization;
- a kill-switch transition after token claim does not refund or resubmit the
  uncertain task;
- recovered provider task ID resumes the original task and does not create a
  second media task;
- `production_ready` rejects provider-only output until managed storage,
  lineage, rights/disclosure, and terminal reconciliation are proven.

### Crash-point and reconciliation matrix

Use deterministic fakes to inject failure before reservation, after
reservation, after request start, after provider acceptance, after usage
capture, after credit draw, after final-gate persistence, and after
authorization claim. For every crash point assert all of the following:

- user ledger effects are zero or exactly one as policy requires;
- no logical call is counted twice and no paid provider task is duplicated;
- durable state is terminal or `reconciliation_required`, never an unbounded
  `running` state;
- refresh/replay returns the same projection and `nextAction`;
- editing/saving remains available while paid retry/export is blocked;
- cancellation follows the before-claim versus after-claim rules;
- replaying the reconciler is a no-op after settlement.

Extend the existing media reconciliation tests, including
`media.hermesReconcile.test.ts`, only at the guarded Vertical Drama seam. Keep
unrelated Media Studio behavior and fixtures unchanged.

### Flag and compatibility tests

Add a focused Feature 157 flag registration test and an adapter matrix covering
legacy, shadow, active, and kill-switch modes:

- every new flag exists in the type, allowlist, defaults, and tenant snapshot;
- all new flags default off;
- shadow executes the legacy result once, performs no user/domain side effect,
  and compares only under platform cost ownership;
- Draft and Prompt active flags affect only their task families;
- the kill switch has highest precedence for new unclaimed attempts and routes
  to the safe legacy/deterministic path;
- claimed or provider-uncertain work continues reconciliation after the kill
  switch and is never resubmitted or blindly refunded;
- flag-disabled legacy requests and existing callers do not require new
  authorization/accounting fields.

Run the focused suite with `npm --workspace apps/web test --` followed by the
changed test files. Report broad `npm --workspace apps/web run check` results
separately because repository-wide type checking may contain baseline noise or
resource failures. This section has no browser or live-provider proof; those
are release gates in Sections 08–10.

## Feature flags, activation, and rollback

The implementation consumes these independent tenant controls from the main
plan: `verticalDramaAssuranceShadow`,
`verticalDramaDraftQcOrchestraActive`,
`verticalDramaPromptQcOrchestraActive`,
`verticalDramaStoryAssuranceActive`, and
`verticalDramaAssuranceKillSwitch`. All default to false except that the kill
switch's effective behavior must always be available to operators.

Flag evaluation is snapshotted on the durable attempt. A flag change cannot
retroactively change billing owner, payer, provider call identity, or token
state. The kill switch stops new Agent admissions and new unclaimed
authorizations, selects the safe existing deterministic/legacy adapter where
that adapter can satisfy the same hard gate, and preserves accepted candidates,
reservations, call records, and event history. It does not clear queues, erase
ledger evidence, refund from absence, downgrade `provider_ready`, or resubmit an
uncertain provider task.

Activation order is flags registered/off, fake-owner fault suite, internal
shadow with platform budget, Draft QC canary, prompt/media canary, then
story/season canary. No active paid flag may be enabled until the crash matrix
passes and Section 10 records environment-specific provider and canary proof.
Rollback is flag-based and additive-schema-safe; old readers remain supported
until every old lease, reservation, and provider reconciliation is terminal.

## Observability and security handoff

Emit tenant-safe metrics by task kind, runtime mode, billing owner, payer,
provider/model, retry class, and release cohort for reserved, actual, refunded,
pending, and platform-shadow credits; physical-call count; duplicate settlement
conflict; authorization claim conflict; provider uncertainty; reconciliation
age; and final-gate block reason. Correlate execution ID, attempt ID,
provider-call ID, reservation ID, authorization token ID, trace ID, and provider
task ID without logging raw prompts, story text, signed URLs, secrets, or
private evidence.

Tenant and domain ownership are rechecked when reading call records, issuing or
claiming authorization, reconciling transactions, and attaching recovered
provider tasks. Server-issued IDs are never accepted as authorization by
themselves. Section 09 will add dashboards, alerts, retention, and the operator
runbook; this section must expose the bounded data and stable reason codes that
those operations require.

## Acceptance criteria

This section is complete only when all of the following are proven with focused
local tests and clean changed-file diagnostics:

1. Every adapter has the fixed billing owner in this section, and the Agent
   Runtime never deducts user credits or submits paid media.
2. Every physical model/provider request has a unique application-owned call
   ID before dispatch and is correlated to one logical attempt, one payer, and
   one settlement state.
3. Deterministic no-op paths create zero reservations and zero deductions.
4. Duplicate delivery, retry, process crash, Redis expiry, and reconciliation
   replay produce zero duplicate user deductions and zero duplicate provider
   tasks in the fault suite.
5. Known usage is settled exactly once even for malformed, rejected, or timed-
   out output; unknown usage is visibly pending and never guessed from an
   estimate.
6. Shadow and fixture comparison create zero user credit effects and zero
   domain/provider side effects; any live shadow cost is explicitly platform-
   owned.
7. Fallback is bounded, receives its own call ID, records both primary and
   fallback cost, and cannot replay an uncertain paid provider side effect.
8. A provider authorization is server-issued, fully bound, unexpired,
   single-use under durable CAS, and consumed by only one provider submission.
9. Cancellation after possible acceptance fences activation and enters
   reconciliation; it never automatically refunds or resubmits.
10. Provider readiness rejects stale fingerprints, wrong readiness, missing or
    consumed authorization, capability mismatch, unresolved credit, and
    provider uncertainty with stable distinct codes and safe next actions.
11. Production readiness additionally proves terminal media ownership,
    managed storage, lineage, rights/disclosure, and completed reconciliation.
12. All Feature 157 flags are independently registered, default off, preserve
    legacy clients when disabled, and obey kill-switch precedence without
    destroying accepted or unsettled evidence.
13. Focused Vitest suites and `git diff --check` pass. Browser, deployment,
    migration, live-provider, and production-canary evidence remain explicitly
    pending until the sections that own those gates execute them.

## Safe implementation and handoff boundary

The safe commit boundary contains the thin billing coordinator, optional
backward-compatible call instrumentation, repeat-safe reservation settlement,
durable authorization issue/claim integration, final-gate extensions, focused
tests, and disabled-by-default flags. It must not activate production traffic,
apply unrelated migrations, change provider selection, refactor Media Studio,
or wire every later Vertical Drama adapter in the same commit.

Section 04 receives the Draft QC billing/reconciliation API. Section 06
receives the usage-only Agent Runtime contract and fallback cost rules. Section
07 receives the provider-ready authorization/claim API and the fixed ownership
matrix for story, prompt, media, and assembly adapters. Section 09 receives
metrics, flags, reconciliation reason codes, and rollback semantics. Section 10
must rerun the crash/idempotency matrix and add real browser/provider/canary
evidence before any production-readiness claim.

## UI/UX Contract

### Target User / JTBD

Creators need a clear non-destructive explanation when credits/provider authorization are pending; operators need a safe reconciliation path.

### Surface Inventory

Existing credit, QC, media-submit, and job-status surfaces show additive outcomes; ledger details remain restricted.

### Component Map

The final gate feeds the shared projection; existing buttons retain routes with typed disabled reasons and retry/reconcile actions.

### State Matrix

`provider_ready` requires authorization and settled billing. Ambiguous provider or credit outcomes become `reconciliation_required`, never success.

### Responsive Matrix

Credit/provider explanations and buttons wrap at 390x844, 768x1024, and 1440x900 without clipping amounts or reasons.

### Accessibility Acceptance

Credit changes and provider failures are announced; actions are keyboard reachable and do not rely on color alone.

### Copy Contract

Thai/English messages distinguish estimate, reserved, charged, refunded, pending reconciliation, and provider retry.

### Browser Evidence Required

Section 10 captures no-credit, refusal, timeout-after-submit, duplicate-submit, refund, and confirmed provider-ready flows.
