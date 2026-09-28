# Section 02 — Durable Attempts, State Machine, Events, and Reconciliation

## Outcome

Implement the durable execution boundary that every later Vertical Drama
assurance adapter will use. An admitted operation must survive Redis expiry,
worker restart, duplicate delivery, browser reconnect, and concurrent repair or
save activity without creating a second logical attempt, losing an accepted
baseline, activating a stale candidate, or repeating a paid/provider side
effect.

This section depends on Section 01's shared Vertical Drama assurance types and
pure projection helpers. It must use those contracts rather than redefine the
state, disposition, readiness, task mapping, fingerprint, or error vocabulary.
All model and provider calls remain outside database transactions. Existing
Node domain ledgers remain the content and active-version authorities; the
assurance persistence layer owns execution lineage and decisions only.

## Tests First

Write the following failing tests before changing schema or repository code.
Keep schema, repository, replay, lease, CAS, and reconciliation failures
separate so a test proves one contract rather than passing through broad mocks.

### Migration and schema contract tests

Extend the existing Drizzle migration-test conventions with
`apps/web/drizzle/__tests__/verticalDramaAssurancePersistenceSchema.test.ts`.
The tests must prove that:

- migration `0238_vertical_drama_story_generation_assurance.sql` remains the
  parent execution owner and is not edited or replaced;
- the successor migration is additive and creates only the missing immutable
  attempt and ordered event relations plus nullable/versioned parent fields and
  indexes;
- existing Feature 152 inserts remain valid before any Feature 157 flag is
  enabled;
- a Draft QC owner may be represented even when a legacy pre-create draft has
  no series ID, while tenant, user, domain owner type, and domain owner ID stay
  mandatory;
- admission uniqueness is scoped by tenant, surface, domain task, source
  fingerprint, and caller idempotency key;
- attempt identity is unique within the tenant and execution, event sequence is
  unique within the execution, and event idempotency prevents duplicate append;
- the active-attempt and accepted-attempt fences cannot select two attempts for
  one execution;
- new nullable/versioned fields are readable before and after dual-write
  activation; and
- running the proven-only migration/backfill twice creates no additional
  attempt or import event and leaves ambiguous legacy rows unchanged.

### Repository and transaction tests

Create
`apps/web/server/services/__tests__/verticalDramaAssuranceRepository.test.ts`
using the repository's Postgres transaction-test pattern. A type-only or
“function exists” test is not sufficient. Cover these cases:

1. Two admissions racing with the same scoped admission key return the same
   execution and attempt and append one `admitted` event.
2. Reusing a caller idempotency key for a different tenant cannot find or
   mutate the first tenant's row.
3. A repair or retry creates a new child attempt with a parent reference; it
   never mutates the prior attempt's immutable envelope, hashes, or budget.
4. Event append atomically validates the transition, increments the parent
   cursor, writes one event, and updates the current projection. A duplicate
   event idempotency key returns the stored event without incrementing again.
5. A transaction rollback leaves neither a cursor gap nor a projection/event
   mismatch.
6. Two workers racing to claim an expired lease yield one owner and distinct
   fencing generations; only the returned generation can renew or append.
7. A worker that loses its lease cannot append success, mark an attempt
   accepted, or invoke activation CAS even when its model result is valid.
8. A finalization race against a newer user edit activates no stale candidate,
   leaves the newer domain version unchanged, and records a typed stale outcome.
9. Two workers finalizing the same candidate produce one accepted version, one
   terminal acceptance event, and the same result on redelivery.
10. Every repository lookup and mutation includes tenant plus domain-owner
    scope; cross-tenant execution, attempt, event, and reconciliation lookup
    fails closed.

### State and replay tests

Extend
`apps/web/server/services/agentRuntime/__tests__/orchestraEventReplay.test.ts`
and add focused tests for the durable adapter. Prove all allowed Feature 157
transitions and reject every other transition. Replay the persisted event list
from cursor zero and from an intermediate cursor, then compare the rebuilt
projection with the stored parent projection. Include redaction tests showing
that story text, prompts, source content, signed URLs, tokens, and private
evidence never enter event payloads.

Legacy mapping fixtures must cover every Feature 152 status. In particular,
`failed` becomes `recovered` only when the domain ledger proves an exact,
current baseline version and fingerprint. A legacy error code may map to
`retryable_failed` only when the classifier recognizes it as retry-safe;
otherwise it fails closed as `fatal_failed` with a legacy-unproven reason. No
fixture may invent a QC score, source fingerprint, owner, accepted artifact, or
historical transition.

### Lease, Redis-expiry, and reconciliation tests

Create
`apps/web/server/services/__tests__/verticalDramaAssuranceReconciliation.test.ts`
and extend the relevant Draft QC job tests. Cover:

- heartbeat renewal before expiry and rejection after expiry;
- worker crash before any side effect, after a durable baseline, and after a
  side effect may have been accepted;
- Redis progress/active-pointer loss with the durable execution still present;
- duplicate queue delivery returning the existing projection rather than
  creating or replaying work;
- repeat reconciliation of the same stale attempt producing the same state and
  no duplicate event;
- exact baseline recovery yielding `recovered`, never `succeeded`;
- no baseline and no possible paid side effect yielding `stale` or
  `retryable_failed` according to the stored error class;
- possible provider or credit acceptance yielding
  `reconciliation_required`, with paid retry, automatic refund, and provider
  resubmission disabled;
- a resolved provider/credit outcome advancing exactly once through the
  Section 03 reconciliation interface; and
- cancellation fencing local work while preserving reconciliation when a paid
  result may exist.

### Domain CAS tests

Extend `apps/web/server/services/__tests__/verticalDramaDraftLedger.test.ts`
with transaction-level candidate-versus-active tests. The CAS must compare the
tenant/domain owner, expected active version, current source and context
fingerprints, candidate version, candidate hash, attempt ID, and fence token.
It must prove that a newer user edit wins, a candidate from another draft or
tenant is rejected, and redelivery after a committed finalization returns the
existing acceptance without appending another draft version.

Run focused tests with
`npm --workspace apps/web test -- <focused test files>`. Migration application,
staging restart, live Redis, provider, browser, and production evidence are
separate gates and must not be inferred from passing Vitest suites.

## Durable Owner Inventory and Reuse Decision

The implementation begins with a read-only schema preflight against
`information_schema`, the Drizzle migration journal, and representative rows.
The inventory below is the frozen ownership decision for this section.

| Existing surface | Current capability | Feature 157 ownership decision |
| --- | --- | --- |
| `vertical_drama_story_generation_runs` / `verticalDramaStoryGenerationRuns`, introduced by migration 0238 | Tenant/user/series execution, source and contract snapshot, current status/stage, event cursor, active attempt pointer, lease owner/expiry, fence token, finalization key, credit totals, and terminal error | Reuse as the sole Vertical Drama assurance execution and current-projection parent. Generalize it additively; do not create `agent_assurance_runs` or another Vertical Drama run table. |
| `verticalDramaStoryGenerationRepository.ts` | Idempotent story-run admission, tenant-scoped reads, checkpoint update, initial lease claim, cancellation, and fenced finalization | Preserve existing exports for Feature 152 compatibility. Implement `verticalDramaAssuranceRepository.ts` as the generalized transaction boundary and make the old repository a compatibility adapter rather than a second writer. |
| `vertical_drama_draft_ledgers` and immutable `vertical_drama_draft_versions` | Draft owner, current version, immutable candidate snapshots, QC metadata, and content hashes | Remain the sole Draft QC candidate/content and active-version authority. Assurance rows store references and acceptance decisions, never copied draft or report content. |
| `vertical_drama_episode_runs` and `vertical_drama_run_artifacts` | Feature 152 episode work and immutable story candidate/report artifacts | Remain story child-step and artifact authorities. Feature 157 links to them by typed owner/artifact reference; it does not change their meaning. |
| `agent_runtime_traces`, introduced by migration 0156 | Generic redacted runtime trace events with tenant/run sequence indexes | Reuse for runtime diagnostics and store only a trace reference on assurance records. It is not the authoritative domain state-event stream because it lacks the required execution foreign key, transition/CAS semantics, and transactional projection update. |
| `agent_runtime_checkpoints` and `checkpointService.ts` | Generic runtime pause/resume snapshots and an abstract persistence interface | Reuse for SDK/runtime resume data when present. It is not the Vertical Drama attempt, lease, or acceptance owner. |
| `orchestraEventReplay.ts` | Pure sequence validation, correction-attempt identity, and payload redaction | Reuse and extend as the pure replay/reducer layer. Durable append belongs in the assurance repository. |
| Redis Draft QC records and active pointers | Queue delivery, heartbeat/progress cache, and short-lived client polling | Keep as an optimization only. Redis loss must not delete, finalize, or readmit a durable execution. |
| Existing credit and media/provider task ledgers | Reservation/draw/refund and provider task acceptance/outcome | Remain sole financial/provider authorities. Section 02 records correlation and reconciliation state but performs no independent debit, refund, or provider submission. |

### Migration 0238 decision

Do not modify or renumber
`apps/web/drizzle/0238_vertical_drama_story_generation_assurance.sql`. Treat it
as an immutable Feature 152 base migration regardless of whether a particular
environment has already applied it. Reuse its
`vertical_drama_story_generation_runs` table as the execution parent, apply
0238 first where it is absent, and add the Feature 157 relations through the
next ordered migration,
`apps/web/drizzle/0245_vertical_drama_assurance_attempts_reconciliation.sql`
at this repository snapshot. Before implementation, re-read the journal and
filesystem and use the next free ordered number if another migration has landed.
This avoids both migration-history drift and a second execution authority.

Migration 0238 cannot by itself satisfy Feature 157: it conflates the current
run projection with one `activeAttemptId`, has no immutable child-attempt rows,
has no replayable domain-event rows, requires a series owner, and scopes active
uniqueness to tenant/series rather than the admitted surface/task/domain owner.
The successor migration therefore:

- adds nullable/versioned parent projection fields for surface, domain-owner
  type and ID, optional series ownership, context snapshot identity,
  disposition, readiness, next action, state version, heartbeat, accepted
  attempt, reconciliation status, and projection schema version;
- allows a proven legacy pre-create draft owner without fabricating a series
  ID, while requiring tenant, user, domain-owner type, and domain-owner ID for
  every new admission;
- replaces the old active-run predicate only after equivalent Feature 152 rows
  are dual-readable, using a scoped active-execution uniqueness rule that does
  not make unrelated task kinds block each other;
- introduces `vertical_drama_assurance_attempts` for immutable attempt
  identity/envelope facts plus a narrowly mutable state projection;
- introduces `vertical_drama_assurance_events` for ordered, append-only,
  redacted state decisions; and
- adds bounded reconciler indexes over nonterminal state, lease/heartbeat age,
  and reconciliation age.

The migration must not copy story, draft, prompt, report, or media payloads into
the new tables. It must not drop the migration 0238 columns or indexes in the
same deploy. Any uniqueness-index replacement uses a dual-index sequence so
draft save and existing story generation remain available.

## Data Contract

### Execution parent

One execution groups the original admission and all child repair/retry
attempts for one tenant, surface, domain task, domain owner, source/context
scope, and caller intent. The parent stores the durable current projection,
monotonic event cursor, active and accepted attempt references, lease/fence
generation, reconciliation summary, and timestamps. It does not store generated
content.

The admission identity is a canonical server-computed key over tenant, surface,
domain task, domain-owner identity, source fingerprint, context fingerprint,
contract version, policy hash, and caller idempotency key. The database unique
constraint uses the required spec scope of tenant, surface, task, source
fingerprint, and idempotency key; the canonical key additionally protects
against accidental caller-key reuse across incompatible contract/context
inputs. A conflict returns the existing execution and attempt only when all
immutable admission facts match. Otherwise return a stable idempotency-scope
conflict and perform no write.

### Immutable attempts

Each initial, repair, or retry attempt receives an opaque `attemptId`, ordinal,
optional parent attempt, mapped runtime task kind, source and context versions
and fingerprints, contract/output/rule-pack/model/policy hashes, compatibility
and assurance modes, budget, side-effect policy, and created timestamp. These
facts are immutable after insert. Repair and retry always insert a child row;
they never rewrite a completed or running attempt.

Only the attempt projection subset may change: state, disposition, readiness,
next action, error code, heartbeat, lease generation observed, accepted or
recovered domain references, final output hash, redacted trace reference,
reconciliation state, and terminal timestamps. Every projection change must be
caused by an event in the same transaction.

### Ordered events

Each event stores execution and attempt identity, execution-global sequence,
event idempotency key, prior and next state, actor class, stable reason code,
contract/output hashes when relevant, redacted trace reference, redacted
metadata, and creation time. The repository locks or conditionally updates the
parent cursor, validates the transition with the Section 01 state machine,
inserts the event, and updates attempt/parent projections atomically.

Use an execution-global sequence so reconnect can replay all attempts through
one cursor. Duplicate delivery of the same event key returns the existing event.
A sequence conflict retries only the short append transaction; it never reruns
model, provider, credit, or domain activation work.

## State-Machine Semantics

The public states are `queued`, `running`, `awaiting_action`, `succeeded`,
`recovered`, `retryable_failed`, `fatal_failed`, `cancelled`, `stale`, and
`reconciliation_required`. The repository accepts only these transitions:

- `queued` to `running`, `cancelled`, `stale`, or `fatal_failed`;
- `running` to `succeeded`, `recovered`, `awaiting_action`,
  `retryable_failed`, `fatal_failed`, `cancelled`, `stale`, or
  `reconciliation_required`;
- `recovered`, `awaiting_action`, `retryable_failed`, `stale`,
  `reconciliation_required`, or `succeeded` to a new child attempt whose
  initial state is `queued`, provided the state-specific admission gate passes;
  and
- no transition out of a terminal attempt row. The parent changes to the child
  projection; the prior attempt remains terminal and immutable.

`reconciliation_required` may create a child attempt only after the provider
and credit owners record a conclusive reconciliation. `succeeded` requires a
current verified candidate, a durable accepted reference, final-gate evidence,
credit reconciliation, and successful domain CAS. `recovered` requires an exact
current baseline reference but never grants verified/provider readiness or
automatic downstream activation.

Legacy Feature 152 statuses are projected additively: `validating` and
`repairing` map to `running`; `awaiting_reconciliation` maps to
`reconciliation_required`; `awaiting_approval`, `needs_repair`, and `partial`
map to `awaiting_action`; and existing terminal states keep their safe
equivalent. Existing `succeeded` is accepted only when its finalization and
domain artifact/version evidence can be proven. Legacy `failed` is never
upgraded to `recovered` from status text alone.

## Lease and Fence Protocol

`claimLease` is a short conditional transaction over an active execution and
attempt. It succeeds only when no lease exists or the prior lease plus grace
period has expired, increments the fence generation, records worker owner,
heartbeat and expiry, and returns the new token. `renewLease` requires tenant,
execution, active attempt, worker owner, current fence token, and a nonterminal
state. `releaseLease` is also fenced.

Every worker-authored event, checkpoint, candidate acceptance, and finalization
must carry the expected fence token and active attempt ID. A mismatch returns a
typed lease-lost result before any domain or side-effect mutation. Cancellation
and reconciliation increment the generation before changing state so an old
worker cannot publish after either action. A network/model call may run while a
lease is active, but no database lock remains open during that call; the worker
must renew and revalidate the fence immediately before committing its result.

Redis heartbeat data may make the UI fresher but never extends the durable
lease. Durable `heartbeatAt` and `leaseExpiresAt` are authoritative for stale
classification.

## Candidate Activation CAS

Add a repository transaction seam that allows a domain-owned activation adapter
to participate in the same short finalization transaction. For Draft QC the
adapter uses `verticalDramaDraftLedger`; story and later adapters supply their
own existing domain ledger implementation.

Before activation, the transaction re-reads and verifies tenant/domain owner,
active attempt, fence generation, source and context fingerprints, expected
active version, candidate version and hash, final-gate disposition, and
reconciliation completeness. The domain adapter performs its own
candidate-versus-active compare-and-set. Only after that CAS succeeds may the
assurance repository mark the attempt `succeeded`, record the accepted domain
reference, append the terminal event, and update the parent projection.

A CAS loss never overwrites the newer domain value. It records `stale` with a
stable current-version conflict code and preserves the candidate for inspection
or a fresh attempt. A redelivered finalization key returns the already committed
acceptance. Domain storage writes and candidate creation occur before this
short transaction; no model, provider, object-storage upload, or credit call is
performed while locks are held.

## Reconciliation and Redis Recovery

Create
`apps/web/server/services/verticalDramaAssuranceReconciliation.ts` as a bounded,
repeat-safe reconciler over the generalized repository. It scans nonterminal
attempts in small indexed batches, claims rows with a reconciler fence, and
uses skip-locked or equivalent conditional updates so concurrent reconcilers do
not duplicate work.

For each expired attempt, reconciliation reads durable facts in this order:

1. Confirm tenant/domain owner, active attempt, fence, source/context identity,
   and current domain version.
2. Resolve any exact accepted or baseline candidate from the domain ledger.
3. Ask the Section 03 provider/credit reconciliation interface whether no side
   effect occurred, the outcome is conclusively known, or acceptance/usage is
   still uncertain. Section 02 defines and fakes this interface in tests but
   does not debit, refund, submit, or invent provider state.
4. If an exact current baseline exists but the latest attempt failed, append
   `recovered` with `recovered_needs_repair`.
5. If no paid side effect occurred and retry classification is safe, append
   `stale` or `retryable_failed` with the server-owned next action.
6. If a provider task or credit usage may exist, append
   `reconciliation_required`, clear all paid retry/repair capabilities, and
   wait for conclusive provider/ledger evidence.
7. If persistence cannot prove ownership, hashes, or candidate identity,
   append `fatal_failed` and alert operators; never fabricate recovery.

Use deterministic reconciliation event keys derived from execution, attempt,
fence generation, and reconciliation reason. Re-running the scan therefore
returns the existing decision. Reconciliation never starts a new attempt by
itself.

Add minimal durable hooks to `verticalDramaDraftQualityQcJobs.ts`: durable
admission precedes Redis enqueue; queue failure records a durable typed event;
status lookup falls back to the durable projection when Redis is absent; and a
worker resumes the admitted attempt rather than readmitting it. Keep Draft
QC-specific result recovery, repair admission, and UI error behavior in Section
04, consuming this repository contract rather than duplicating it.

## Repository and File Changes

- Add
  `apps/web/drizzle/0245_vertical_drama_assurance_attempts_reconciliation.sql`
  (or the next free ordered number selected by the migration preflight)
  as the successor migration; leave migration 0238 unchanged.
- Extend `apps/web/drizzle/schema.ts` to mirror the additive parent fields and
  the new attempt/event tables exactly.
- Add
  `apps/web/server/services/verticalDramaAssuranceRepository.ts` for scoped
  admission, child-attempt creation, event append/replay queries, projection,
  lease/fence operations, finalization CAS coordination, and reconciliation
  claims.
- Add
  `apps/web/server/services/verticalDramaAssuranceReconciliation.ts` for bounded
  stale-run and uncertain-side-effect classification.
- Adapt
  `apps/web/server/services/verticalDramaStoryGenerationRepository.ts` to call
  the generalized repository while preserving its existing Feature 152 API and
  status compatibility.
- Extend
  `apps/web/server/services/agentRuntime/orchestraEventReplay.ts` with the
  Section 01 state reducer and deterministic projection replay; keep it pure.
- Extend `apps/web/server/services/verticalDramaDraftLedger.ts` with the
  tenant-scoped candidate activation CAS seam; do not move content ownership
  into assurance tables.
- Add only the durable enqueue/read/reconcile hooks described above to
  `apps/web/server/services/verticalDramaDraftQualityQcJobs.ts`; defer repair
  behavior to Section 04.
- Add the focused migration, repository, replay, ledger CAS, job-expiry, and
  reconciliation tests listed in this section.

No router, client, Python, credit-ledger, provider-task, or feature-flag default
change belongs in this section.

## Proven-Only Legacy Migration

Deploy readers before any backfill. Existing migration 0238 rows remain valid
and are projected through the compatibility adapter. The backfill may create a
child attempt only when `contractJson` contains an attempt ID and its tenant,
user, domain owner, source revision/fingerprint, contract hash, and current
domain reference agree with authoritative rows.

For such a row, append one explicitly labelled `legacy_imported` event from no
prior state to the safely mapped current state. This event records migration
provenance; it does not claim to reconstruct missing history. A legacy
`succeeded` row requires finalization plus accepted artifact/version evidence.
A legacy failed row requires an exact current baseline before it can project as
recovered.

Rows with missing or contradictory ownership, fingerprint, attempt, score, or
acceptance evidence stay on the legacy read path with an auditable
legacy-unproven code. Do not invent values, blind-fill from another tenant or
series, or block draft save while waiting for cleanup. The backfill is bounded,
cursor-based, restartable, and idempotent.

## Rollout, Observability, and Rollback

1. Apply migration 0238 where absent, then the successor migration, with all
   Feature 157 runtime flags disabled. Verify columns, constraints, indexes,
   foreign keys, old-row reads, and representative tenant-scoped query plans.
2. Deploy the dual-read repository. Existing Feature 152 and Draft QC behavior
   remains authoritative; no new hard gate is enabled.
3. Enable dual-write shadow mode for an internal tenant/series allowlist. Write
   durable attempts/events and compare the replayed projection with the legacy
   projection without adding model calls, provider work, or user charges.
4. Run the proven-only backfill in bounded batches and report imported,
   ambiguous, conflicting, and skipped counts. Do not make new fields required
   while ambiguous active rows remain.
5. Hand the stable persistence contract to Sections 03 and 04. Draft QC active
   traffic is not enabled by this section alone.

Record admission conflicts, duplicate-event suppression, transition rejection,
lease claims/losses, stale age, replay divergence, CAS conflicts, recovered
baseline count, reconciliation-required count/age, legacy-unproven count, and
reconciler batch latency. Metrics and logs carry tenant class and task kind but
not story text, prompt text, private evidence, signed URLs, or secrets.

Rollback is application- and flag-level: stop new Feature 157 admission and
dual-write, retain dual-read compatibility, and continue serving accepted
domain versions through the old path. Do not drop the additive tables, delete
events, rewrite migration 0238, clear Redis, revert user drafts, refund without
ledger proof, or resubmit uncertain provider tasks. Keep the new reader until
all old leases and reconciliations are terminal.

## Acceptance Criteria

This section is complete when all of the following are true:

- The durable-owner inventory is verified against the actual schema and
  migration ledger, and migration 0238 is reused as the execution parent
  without modification.
- The successor migration is additive, old Feature 152 rows and inserts remain
  compatible, and ambiguous legacy data is neither fabricated nor blocked.
- Duplicate concurrent admission creates one execution, one initial attempt,
  and one admitted event.
- Every projection mutation has exactly one ordered durable event, replay
  reproduces the stored projection, and Redis expiry does not lose state.
- Lease renewal and fence loss prevent stale workers from appending, accepting,
  charging, submitting, or activating.
- Candidate-versus-active CAS produces at most one accepted domain version and
  never overwrites a newer user edit.
- Reconciliation is repeat-safe, preserves an exact valid baseline, and blocks
  duplicate paid/provider work whenever outcome is uncertain.
- All repository and backfill paths fail closed on missing tenant or owner
  identity and pass cross-tenant isolation tests.
- With flags off, existing save, edit, status, Feature 152 generation, and Draft
  QC behavior remain unchanged.
- Focused migration/schema/repository/replay/CAS/reconciliation tests pass, with
  local proof reported separately from unapplied migration, live Redis restart,
  staging, provider, browser, deployment, and production-canary evidence.

## Safe Commit Boundary

Commit this section only with the successor migration, mirrored Drizzle schema,
generalized repository, pure replay changes, reconciliation service, minimal
legacy adapters/hooks, and all focused tests passing. Do not combine it with
credit/provider implementation, Draft QC repair behavior, router/UI changes,
Agent Runtime activation, or production flag enablement. Those consume this
contract in later sections.

## UI/UX Contract

### Target User / JTBD

A creator can refresh, reconnect, retry, repair, or cancel without losing the durable attempt or repeating an action that already ran.

### Surface Inventory

Existing QC, story job-status, and activity/history surfaces expose the projection; reconciliation details are operator-only.

### Component Map

Repository state maps to the common Section 01 projection and Section 08 components. Redis progress is advisory only.

### State Matrix

Every durable state has disposition, readiness, nextAction, and permissions. `recovered` and `reconciliation_required` are never rendered as `succeeded`.

### Responsive Matrix

Status and next-action content wraps at 360x800, 390x844, 768x1024, and 1440x900 without data loss.

### Accessibility Acceptance

Progress and terminal transitions are announced; retry/repair are keyboard reachable and explain server preconditions.

### Copy Contract

Stable localized codes describe stale, missing-result, conflict, and reconciliation states without exposing implementation details.

### Browser Evidence Required

Section 10 proves refresh during running, Redis loss, duplicate click, stale repair, recovered baseline, and child repair.
