# Feature 166: Polymorphic Credit Context and Work Lineage

**Status:** SPEC REVIEW PASSED (59 rounds) — deep-plan complete; deep-implement complete locally; external migration/backfill/browser/staging/production proof pending
**Version:** 1.10.0
**Created:** 2026-08-27
**Last reviewed:** 2026-08-27
**Priority:** P0 — auditable credit attribution and work-level reporting
**Owner:** Billing / Skill Runtime / LLM Runtime / Vertical Drama
**Depends-on:** Existing `credit_transactions` ledger, `creditService.ts`,
`skillRevenueBilling.ts`, Skills registry and billing contracts, existing LLM
call paths, Vertical Drama Series/Job/Run tables, and the authenticated Credits
page/API
**Related:** Feature 155 Vertical Drama Cost Control, Feature 161 Vertical
Drama Async Skill Jobs, Feature 165 Vertical Drama Auto-completion Credit
Ledger

## 1. Executive decision

Introduce a reusable polymorphic work-context layer that links every new
Skill/LLM credit transaction to the work that caused it. The layer supports a
hierarchy such as:

```text
Series: รักลวงใจ
  └── Job: สร้างบทและตรวจคุณภาพ
        └── Run: run-abc123
              └── Credit transaction: -50 credits
```

The implementation consists of two normalized context tables plus one
operational backfill-run table:

```text
credit_transactions
        │
        └── credit_transaction_contexts
                    │
                    └── credit_contexts

credit_context_backfill_runs  (checkpoint/audit metadata only)
```

`credit_transactions` remains the sole authoritative financial ledger. The
new tables contain lineage, ownership, hierarchy, and display snapshots only.
They must never maintain a second balance, independently debit credits, or
replace the existing idempotent credit service.

The first release reports **actual platform credits**:

```text
gross charged credits - linked refund credits = net actual credits used
```

Provider USD estimates, external-equivalent costs, budget forecasts, and hard
caps remain outside this feature. They may consume this context layer later,
including through Feature 155, without changing the transaction model.

## 2. Problem statement

The current `credit_transactions` table already records amount, type,
description, source type, skill slug, conversation, trace ID, idempotency key,
and JSON metadata. Several LLM and Skill callers also know a Series ID, Job ID,
Task ID, Run ID, or media task ID. However, those references are not governed
by one contract and are often stored only in metadata.

As a result, users and operators cannot reliably answer:

1. How many credits did one Series consume across all LLM/Skill calls?
2. Which Job, Run, episode, stage, or retry caused a charge?
3. Which credits were charged, refunded, or adjusted for the same work?
4. What should be shown to a user instead of a raw Series ID or opaque UUID?
5. Which historical transactions can be attributed with confidence, and which
   must remain unattributed?
6. Can the same report work for Vertical Drama, chat Skills, workflows,
   worker jobs, media tasks, and future work types without another ledger
   migration?

The solution must preserve existing balances, fixed Skill settlement, LLM
pricing, idempotency, tenant isolation, and audit behavior.

## 3. Goals

1. Create a normalized, reusable polymorphic context registry for Series, Job,
   Task, Run, Conversation, Workflow, Media Task, Worker Job, and future work
   types.
2. Link every new actual billable Skill/LLM credit debit and its refund or
   reconciliation transaction to one primary work context and, when known, its
   parent contexts. This includes synchronous, asynchronous, background,
   scheduled, API, Worker, retry, and queue-redelivery paths whenever a user
   account is charged.
3. Preserve a parent/root hierarchy so one transaction can be reported by
   Series, Job, Task, Run, Skill, or another supported work boundary.
4. Make actual credit reports queryable by work without searching descriptions,
   dates, or arbitrary JSON text.
5. Display a human-readable title or work label on the user Credits page.
6. Keep technical IDs available for authorized audit detail without exposing
   them as the primary user-facing label.
7. Backfill historical lineage only when the relationship can be verified from
   persisted data and user/tenant ownership.
8. Make missing or ambiguous historical lineage visible as an explicit
   unattributed state rather than silently guessing.
9. Support retry, duplicate delivery, fixed Skill revenue settlement, refund,
   and reconciliation without double-counting.
10. Provide a report API and UI that calculate actual credits from the existing
    immutable financial ledger.
11. Keep the layer tenant-safe, bounded, idempotent, observable, and usable at
    least 10x the current transaction volume.

## 4. Non-goals

1. Do not create a second credit balance, wallet, financial ledger, or
   independent debit path.
2. Do not change the meaning of `credit_transactions.amount`, `type`,
   `sourceType`, `skillSlug`, `balanceAfter`, or idempotency behavior.
3. Do not calculate provider USD cost in the first release.
4. Do not represent external uploads as actual platform credit charges.
5. Do not implement the full Feature 155 forecast, repair reserve, external
   equivalent, or hard-cap system here.
6. Do not infer a Series from the transaction timestamp, description, user
   alone, or proximity to another job.
7. Do not persist raw prompts, full provider payloads, signed URLs, API keys,
   or unbounded metadata in a context snapshot.
8. Do not expose another tenant's context title, IDs, model, provider, or
   transaction amounts.
9. Do not require every purchase, bonus, or unrelated admin transaction to have
   a work context.
10. Do not delete historical credit transactions when a source Series, Job, or
    Task is archived or deleted.

## 5. Existing codebase contracts

The implementation must extend existing seams rather than create parallel
billing paths.

| Existing seam | Current contract | Required integration |
|---|---|---|
| `apps/web/drizzle/schema.ts` | `creditTransactions` is the existing ledger with amount, type, metadata, reference, idempotency, trace, conversation, skill slug, source type, and balance-after | Add transaction-time tenant provenance, the two context tables, the operational backfill-run table, and types; preserve all existing financial behavior |
| `apps/web/server/services/creditService.ts` | `deductCredits`, `deductCreditsForModel`, reservations, refunds, and transaction history are the central credit boundary | Accept normalized attribution context and write transaction links atomically with the debit/refund path |
| `apps/web/server/services/skillRevenueBilling.ts` | Fixed Skill settlement creates the user debit and revenue distribution rows idempotently | Propagate the same work context to the user debit, tenant revenue, owner revenue, and reversal rows with explicit accounting roles |
| `apps/web/server/services/verticalDramaLlmBilling.ts` | Physical Vertical Drama LLM attempts already receive `seriesId`, `jobId`, `runId`, stage, scope, skill slug, model, and attempt key | Convert these fields into explicit context references; retain metadata as a bounded trace aid |
| `apps/web/server/services/callLLMStructured.ts` | Structured LLM billing derives Skill billing from `billingMetadata.skillSlug` | Extend the billing metadata/context adapter without allowing a missing Skill slug to become a Skill charge |
| `apps/web/server/services/skillExecutor.ts` | Skill execution uses run IDs, skill slugs, source types, and media/LLM billing paths | Create/reuse a Skill execution context and pass it through every actual charge and refund |
| `apps/web/server/_core/llmRoutes.ts` / `llmRoutesHandler.ts` | Chat and route-level LLM calls use `deductCredits` or `deductCreditsForModel` | Preserve chat behavior and attach conversation/job context when available |
| `apps/web/server/_core/responsesRoutes.ts` | Responses and delegated tool calls use source types and metadata | Attach the originating work context without storing raw request payloads |
| `apps/web/server/_core/mcpRegistry.ts` | MCP/API media and agency paths already carry idempotency and task metadata | Map supported task/job references into contexts and preserve API source types |
| `apps/web/server/routers/credits.ts` | User/admin history returns sanitized metadata and exact Skill joins | Return safe context presentation and separate technical audit references |
| `apps/web/client/src/pages/Credits.tsx` | Credits page renders mobile cards, desktop table, Skill labels, metadata, and audit dialog | Render context title/work label before technical descriptions and add actual usage-by-work summary |
| `apps/web/shared/creditTransactionSource.ts` | Shared source and Skill display normalization exists | Extend it with context presentation rules and legacy fallbacks |
| `apps/web/drizzle/meta/_journal.json` | The pre-Feature-166 migration journal was inspected for sequencing | Add and register 0264 after the existing 0263 entry using the repository's actual migration rules |
| `specs/feature/155-vertical-drama-cost-control-budget-ledger/spec.md` | Feature 155 defines future cost plans/events and requires the existing ledger as authority | This feature supplies reusable lineage; do not duplicate Feature 155 cost events or estimates |

The repository currently has extensive unrelated dirty work. Implementation
must stage and modify only owned paths and must not reset, clean, or rewrite
existing changes.

## 6. Terminology and accounting semantics

### 6.1 Context

A Context is a durable, tenant-scoped reference to a piece of work or a
business entity that can explain a credit transaction. It is not itself a
financial event.

### 6.2 Context hierarchy

Contexts may have parent and root contexts:

```text
root: Series
  parent: Job
    parent: Task
      primary: Run
```

`rootContextId` is stored on every context to make Series/work rollups cheap
without recursively walking the hierarchy for every report. A context has at
most one immediate parent; deeper ancestry is represented by the parent's own
`parentContextId`. A context may be shared by multiple transactions, and a
transaction may link to multiple contexts.

### 6.3 Polymorphic source reference

The registry uses a namespaced reference rather than assuming every source has
an integer ID:

```text
contextType = "series"
sourceType  = "vertical_drama_series"
sourceId    = "123"
contextKey  = "vertical_drama_series:123"
```

Examples:

```text
vertical_drama_series:123
vertical_drama_story_generation_run:run-abc123
media_task:task-456
worker_job:job-789
conversation:987
```

The application resolver validates the source table/system, tenant, user
ownership, active/archived state, and display name. The database cannot create
a single foreign key to every possible source table, so polymorphic integrity
is enforced through namespaced keys, typed resolvers, ownership checks, unique
constraints, and automated orphan audits.

Each registered resolver must expose a server-owned registration containing
`sourceType`, `contextType`, a resolver version, an authoritative source lookup,
the ownership/tenant check, a safe display-name extractor, an explicit
allowlist of parent context types, whether the type may be a root, and the
required ancestry policy for a fully linked report row. The registration must
also define source lifecycle capability (active/archive/delete/temporarily
unavailable) so a transient lookup failure cannot be interpreted as deletion.
A resolver result must identify whether the source is active, archived,
missing, temporarily unavailable, or ambiguous and return only bounded
snapshot facts. A new source type is not production-ready until its
registration, root/parent policy, ancestry policy, resolver version, ownership
test, lifecycle test, and display fallback test are present.
`temporarily_unavailable` is a transient resolver outcome, not a persisted
`resolutionState` value; the writer keeps the last verified state, does not
archive the context, and schedules/returns retry according to the caller's
policy.

### 6.4 Actual credit semantics

The report uses only linked financial rows and never copies amounts into the
context table:

```text
grossChargedCredits = sum(abs(amount))
  for linked usage rows where amount < 0
  plus approved work_adjustment rows where amount < 0

refundedCredits = sum(amount)
  for linked refund rows where amount > 0
  plus approved work_adjustment rows where amount > 0

netActualCredits = grossChargedCredits - refundedCredits
```

Adjustments are reported separately unless explicitly linked as a
`work_adjustment` under an allow-listed accounting rule. Purchase, bonus,
subscription, and revenue distribution rows are not user production cost by
default. “Reconciliation” in this feature normally means repairing lineage
for an existing ledger row; it must not create a new amount. If a financial
`adjustment` row is created by an existing billing policy, it is included only
when that policy explicitly classifies it as a `work_adjustment`.

For fixed Skill billing, the end-user report counts the user debit only. Tenant
and Skill-owner revenue distribution rows retain the same context for
accounting audit but are classified as `revenue_distribution` and never added
again to the user's production cost.

An actual work-cost report includes only transaction rows that have a valid
`primary_work` link for a usage debit, a valid `reversal` link for a refund,
or a valid allow-listed `work_adjustment` link for an adjustment, for the
requested tenant/user scope. It does
not include account purchases, bonuses, subscriptions, creator revenue, or
unlinked adjustments. Admin/system deductions are excluded by default even if
their amount is negative or the current compatibility path records them as a
`usage` row; an admin row may enter a work report only through an explicit,
allow-listed `work_adjustment` policy and link. The implementation must not
silently reclassify historical admin rows or infer a work context from their
description/metadata. A linked media transaction may appear if a media path
uses the same context contract, but this feature's mandatory caller coverage is
Skill/LLM billing.

For a refund to be a valid production-cost reversal, its original transaction
must be a refundable usage/work-adjustment row owned by the same user and
tenant, and the cumulative accepted refunds for that original must not exceed
its refundable amount. Self-reversals, reversal chains, duplicate reversal
allocations, and refunds exceeding the remaining refundable amount are
integrity exceptions: they remain immutable ledger history, are excluded from
named net-cost totals until repaired by the existing financial policy, and are
reported in a separate data-quality bucket. The report must never clamp an
over-refund into a plausible number or silently mutate the original ledger row.
`integrityExceptionTransactionCount` counts distinct affected ledger rows, and
`integrityExceptionCredits` is the non-negative sum of the excluded amount
portion: the full absolute amount for an invalid relation, or only the excess
portion when a refund is partly valid. It is not added to charged, refunded,
or net actual totals and is never a replacement balance.

## 7. Data model

### 7.1 `credit_contexts`

This table is the canonical registry of polymorphic work references.

Required columns:

| Column | Type/shape | Rules |
|---|---|---|
| `id` | PostgreSQL `uuid` primary key, default `gen_random_uuid()` | Stable internal context ID; never shown as the normal user label |
| `tenantId` | varchar(36) not null FK to `tenants` | Required for all work contexts; `ON DELETE RESTRICT` |
| `ownerUserId` | integer nullable FK to users | Creator/owner when the source is user-owned; nullable for tenant-shared work; `ON DELETE SET NULL` |
| `contextType` | varchar(32) not null | `series`, `job`, `task`, `run`, `skill_execution`, `conversation`, `workflow`, `media_task`, `worker_job`, or registered future type |
| `sourceType` | varchar(96) not null | Namespaced source domain/table identifier |
| `sourceId` | varchar(191) not null | String form of numeric, UUID, or provider/job identifier |
| `contextKey` | varchar(300) not null | Canonical `${sourceType}:${sourceId}` |
| `parentContextId` | UUID nullable self-reference | Immediate parent in the work hierarchy; `ON DELETE SET NULL` |
| `rootContextId` | UUID nullable self-reference | Root context for indexed rollups; root points to itself; `ON DELETE SET NULL` |
| `displayNameSnapshot` | varchar(255) nullable | Safe name captured at first resolution; nullable for unresolved/ambiguous rows; never raw prompt/payload |
| `displayTypeSnapshot` | varchar(64) nullable | Human-readable type such as `เรื่อง`, `งาน`, `Run` |
| `resolutionState` | varchar(32) not null | `resolved`, `historical_resolved`, `archived`, `partial`, `unresolved`, `ambiguous` |
| `sourceRevision` | varchar(128) nullable | Optional source revision/version for audit |
| `snapshotJson` | jsonb nullable | Bounded, allow-listed context facts only |
| `resolverVersion` | varchar(32) not null | Version of the server resolver/normalization contract used to create or verify the row |
| `createdAt` / `updatedAt` | timestamptz | Normal timestamps |
| `archivedAt` | timestamptz nullable | Set when source is no longer active; never delete for ledger retention |

Required constraints/indexes:

```text
UNIQUE (tenantId, contextKey)
INDEX  (tenantId, rootContextId, createdAt)
INDEX  (tenantId, contextType, sourceType, sourceId)
INDEX  (tenantId, ownerUserId, updatedAt)
INDEX  (parentContextId)
CHECK (parentContextId IS NULL OR parentContextId <> id)
```

`contextKey` must be normalized and length-limited before insertion. It must
not contain secrets, URLs with credentials, raw prompts, or arbitrary client
JSON. `contextType` and `sourceType` are varchar columns backed by a server
registry/allowlist rather than a client-controlled free-form value. Adding a
new supported type requires a resolver and test; it is not enabled merely by
sending a new string from a client.

The database must enforce non-empty/length bounds for required string fields.
The application must enforce a maximum serialized `snapshotJson` size and an
allow-list of snapshot keys. `rootContextId` must point to an existing context
in the same tenant, must be the root itself when `contextType` is a root type,
and must never form a cycle. These hierarchy invariants require a transactional
resolver plus an integrity audit because a normal SQL CHECK constraint cannot
inspect another row or polymorphic source table.

At minimum, the writer/audit must enforce: a root context points to itself, a
non-root context has a non-null root after successful resolution, parent and
root contexts share the tenant, a context is not its own parent, and the parent
chain cannot return to any ancestor. A `partial` context may temporarily have
missing ancestry only when the source itself is verified and its report status
is not treated as fully linked.

Allowed state transitions are explicit: `unresolved -> resolved | partial |
ambiguous`, `ambiguous -> resolved | partial`, `partial -> resolved`, and any
verified active state may move to `archived` when the source is archived or
deleted. `historical_resolved` is reserved for immutable backfill evidence and
may move only to `archived`; `archived` is terminal for automatic resolution.
Reactivation or correction requires the authorized correction workflow and an
audit event. Every state transition, resolver failure, archive/delete
reconciliation, and manual correction must emit a bounded event through the
existing audit logger containing context ID, tenant, old/new state, reason,
resolver version, actor/service identity, and trace ID where available. It must
not contain raw source payloads or prompt text. Audit delivery is best-effort
for request paths but failures emit a metric and never block or mutate the
financial ledger. No transition may erase a snapshot or rewrite a transaction
link.

`displayNameSnapshot` is immutable after first successful resolution except
for an explicitly authorized data-correction operation. Current display names
may be resolved from the source for normal UI display, but changing a source
title must not rewrite historical snapshots.

For `unresolved` and `ambiguous` contexts, `displayNameSnapshot` may be null;
the UI must use a localized safe fallback and must not manufacture a title from
an unverified ID. A `resolved`, `historical_resolved`, `partial`, or `archived`
context must have a non-null safe snapshot before it can be used as a named
report row. The resolver and integrity audit enforce this state-to-snapshot
invariant.

### 7.2 `credit_transaction_contexts`

This table links financial rows to one or more context levels.

Required columns:

| Column | Type/shape | Rules |
|---|---|---|
| `transactionId` | integer FK to `credit_transactions` | `ON DELETE RESTRICT`; financial history is append-only and a transaction must not be deleted while context links exist |
| `contextId` | UUID FK to `credit_contexts` | `ON DELETE RESTRICT`; contexts are archived, not deleted |
| `relationType` | varchar(32) not null | `primary_work`, `root_work`, `parent_work`, `execution`, `conversation`, `revenue_distribution`, `reversal`, or `work_adjustment` |
| `isPrimary` | boolean not null default false | At most one primary work link per transaction |
| `provenance` | varchar(32) not null | `new_explicit`, `new_metadata`, `historical_verified`, or `manual_review` |
| `createdAt` | timestamptz | Link creation time |

Required constraints/indexes:

```text
PRIMARY KEY (transactionId, contextId, relationType)
UNIQUE partial (transactionId) WHERE isPrimary = true
CHECK (isPrimary = false OR relationType IN ('primary_work', 'reversal', 'work_adjustment'))
INDEX (contextId, transactionId)
INDEX (transactionId, contextId)
INDEX (relationType, transactionId)
INDEX (relationType, contextId, transactionId)
```

The primary link is the transaction's most specific billable work boundary
(normally Run/Task/Job). The linked context's `rootContextId` is the Series or
other top-level work used for rollups. Parent links are explanatory and must
not cause a transaction amount to be summed more than once.

For a usage debit, exactly one `isPrimary = true` link with
`relationType = "primary_work"` is required when `attributionMode` is
`required`. For a refund, exactly one primary link to the original work is
required when the original transaction is known; it uses
`relationType = "reversal"` and `reversalOfTransactionId` points to the
original ledger row. Revenue-distribution links are never primary for a
user-cost report.

The writer must reject a `reversal` link on a non-refund transaction, a
`primary_work` link on a refund unless the accounting contract explicitly
classifies it as a work adjustment, and a `work_adjustment` link unless the
transaction type is `adjustment` and its accounting rule is allow-listed.
Cross-row rules that cannot be represented by a CHECK constraint (for example,
the transaction type and its reversal field) are enforced in the central
writer and covered by the integrity audit.

The link table deliberately does not duplicate `tenantId` or `userId`.
Tenant scope is derived from both `credit_contexts.tenantId` and the
transaction-time `credit_transactions.tenantId`; transaction user scope is
derived from `credit_transactions.userId`. The transaction-bound writer must
validate these values against the authenticated/request scope before inserting
a link; report queries must apply both joins explicitly. This avoids two
mutable copies of ownership data drifting apart. A scheduled integrity audit
must detect tenant mismatch, null tenant on a new required row, and a context
owner that is not authorized for the transaction.

### 7.3 Additive provenance and reversal fields on `credit_transactions`

Add these additive fields to the existing ledger:

| Column | Type/shape | Rules |
|---|---|---|
| `tenantId` | varchar(36) nullable FK to `tenants.id` | Required for every new user-owned debit/refund/adjustment; nullable only for legacy rows that cannot be proven and system rows such as `userId = 0`; `ON DELETE RESTRICT` |
| `reversalOfTransactionId` | integer nullable self-reference to `credit_transactions.id` | `ON DELETE RESTRICT`; populated for a refund/reversal when the original transaction is known |

`tenantId` is the transaction-time tenant provenance and must never be
derived from `users.currentTenantId` when reading historical rows. New billing
writers receive it from the authenticated/work context and write it in the
same ledger transaction. A context link is valid only when the linked
`credit_contexts.tenantId` equals the transaction's `tenantId`, except for
explicitly classified legacy rows where the tenant is null and the link remains
historical-only until reconciled.

`reversalOfTransactionId` is an audit relationship, not a second amount ledger. The existing
`referenceId` and `metadata.originalTransactionId` remain readable for
backward compatibility. The new refund writer must populate the structured
field and continue writing the compatibility values during rollout. A refund
must never mutate the original transaction amount.

The migration must add indexes on `tenantId` and `reversalOfTransactionId`.
It must also add report-path indexes equivalent to
`(tenantId, type, createdAt, id)` and `(userId, tenantId, createdAt, id)` on
`credit_transactions`; the existing type/date indexes remain for backward
compatibility. Index names must follow the repository naming convention.
It must backfill `tenantId` only from a verified context link, an immutable
tenant-bearing transaction source, or a user whose tenant membership proves a
single unambiguous tenant. It must never copy the current tenant blindly.
It must backfill `reversalOfTransactionId` only when the existing
metadata/reference identifies a valid transaction owned by the same user and
tenant boundary. Invalid or ambiguous references remain null and are reported
for reconciliation.

### 7.4 Optional source resolvers, not source-table duplication

The first implementation must provide resolvers for:

1. `vertical_drama_series` — live title from `vertical_drama_series.title`
2. Vertical Drama story-generation, episode-run, prompt-expansion, and other
   durable run/job records already carrying tenant/user/Series ownership
3. `media_task` and existing media task identifiers where ownership is already
   enforced
4. `conversation` — existing conversation ownership
5. generic Skill/LLM `skillRunId`, idempotency key, or job/run identifiers when
   no stronger source table exists; new Skill calls use the
   `skill_execution` context type when no durable source table exists

An unknown source type is stored only as `unresolved` after it passes basic
tenant/user validation. It must not be silently treated as a valid Series.
If a known source resolves but one or more parent/root records are temporarily
missing, the context is `partial`; it may be retained for repair but cannot
appear as a fully attributed named rollup until its required ancestry is
repaired.

### 7.5 Retention and lifecycle

Context rows and transaction links follow the retention policy of the
financial ledger. They are never hard-deleted as part of normal Series, Job,
Task, or Run deletion. Source deletion/archive changes the context to
`archived` and clears no historical display snapshot. Any legal-retention
purge must be an explicitly authorized ledger-retention operation that purges
the transaction and its links together and records the purge boundary; it is
not part of this feature. The implementation must make this transition
observable and restart-safe through either the existing source lifecycle event
handler or a scheduled reconciliation worker; the selected mechanism must be
documented in the rollout runbook. It must be idempotent, tenant-scoped, and
must not archive a context merely because a transient source lookup failed.
Repeated reconciliation must not rewrite `displayNameSnapshot`, transaction
links, or financial rows.

### 7.6 Backfill run metadata

`credit_context_backfill_runs` is an operational checkpoint table with no
balance or amount columns. It must contain at least:

| Column | Type/shape | Rules |
|---|---|---|
| `id` | PostgreSQL `uuid` primary key, default `gen_random_uuid()` | Stable run ID printed by the CLI |
| `mode` | varchar(16) not null | `dry_run`, `canary`, `apply`, or `audit` |
| `status` | varchar(16) not null | `running`, `paused`, `completed`, `failed`, or `cancelled` |
| `schemaVersion` | varchar(32) not null | Migration/contract version used by the run |
| `lastTransactionId` | integer nullable | Keyset cursor; monotonically advances only after a committed batch |
| `scanThroughTransactionId` | integer not null | Immutable high-water mark captured when the run starts; the run never scans beyond it |
| `tenantId` / `userId` | scoped filters nullable | Optional operator filters |
| `countersJson` | bounded jsonb not null | Allow-listed counters and parity values only |
| `operatorId` | varchar(128) not null | Authenticated operator/service identity |
| `createdAt` / `updatedAt` / `completedAt` | timestamptz | Run lifecycle timestamps |

Required run-metadata indexes are `(status, mode, updatedAt)` and
`(tenantId, userId, status, updatedAt)`. A run ID is immutable; counters and
cursor updates are conditional on the current run version/lease so two
workers cannot advance the same run concurrently.

Only one active `apply`/`canary` run may operate on the same scope at a time.
The tool must acquire a database/advisory lock or equivalent lease and release
it on completion, pause, failure, or cancellation. A stale lease must be
recoverable by an authorized operator without deleting run evidence.

The high-water mark makes dry-run, canary, resume, and apply comparisons
reproducible. Transactions created after it are handled by the live writer and
are not silently mixed into the historical batch; a later run covers them.

## 8. Context creation and write contract

### 8.1 Shared TypeScript contract

Add a shared server-side contract equivalent to:

```ts
export type CreditContextType =
  | "series"
  | "job"
  | "task"
  | "run"
  | "skill_execution"
  | "conversation"
  | "workflow"
  | "media_task"
  | "worker_job";

// Runtime values come only from the server-owned resolver registry.
export type CreditContextSourceType = string;

// This is the persisted `credit_transactions.sourceType` namespace. The
// service-level CreditSourceType may contain semantic aliases that normalize
// to an enum value before insert (for example vision/embedding/reference
// resolution currently persist as `other`). Reports filter the persisted
// namespace, never an unpersisted alias.
export type PersistedCreditSourceType =
  (typeof CREDIT_TRANSACTION_SOURCE_TYPES)[number];

export interface CreditContextRef {
  contextType: CreditContextType;
  sourceType: CreditContextSourceType;
  sourceId: string;
  parent?: CreditContextRef;
  displayName?: string; // hint only; server resolves the authoritative name
  sourceRevision?: string;
}

export type CreditAttribution =
  | {
      tenantId: string;
      contractVersion: 1;
      attributionMode: "required";
      primary: CreditContextRef;
      conversation?: CreditContextRef;
      provenance?: "explicit" | "metadata";
    }
  | {
      tenantId: string;
      contractVersion: 1;
      attributionMode: "best_effort";
      primary?: CreditContextRef;
      conversation?: CreditContextRef;
      provenance?: "explicit" | "metadata";
    };
```

Place the serializable input types in
`apps/web/shared/creditContext.ts` and the resolver, transaction-bound writer,
integrity checks, and repair service in
`apps/web/server/services/creditContextService.ts`, following the repository's
existing import conventions. Callers must not directly insert rows into either
context table.

`attributionMode = "required"` means the referenced context must resolve and
the primary link must be written before the billable debit/provider dispatch is
allowed. A missing, invalid, cross-tenant, or ambiguous required context is a
precondition failure and must not result in a provider call or credit debit.
`attributionMode = "best_effort"` is allowed only for an explicitly registered
legacy/general path that has no durable work entity; it may create an
unattributed transaction and must emit a metric. A path must not use
`best_effort` merely to hide a malformed or unauthorized context reference.
All new user Skill/LLM entrypoints default to `required`; the rollout may
temporarily classify an audited legacy path as `best_effort` until it is
converted.

### 8.2 Server-side resolution

`ensureCreditContext` must:

1. Require a non-empty tenant ID and authenticated user context where the
   caller is user-facing.
2. Normalize `sourceType`, `sourceId`, and `contextType`.
3. Resolve the source with the registered resolver.
4. Verify tenant ownership and user access before reading title or creating a
   link.
5. Use the authoritative source title; treat client `displayName` as a hint
   only.
6. Upsert by `(tenantId, contextKey)` idempotently.
7. Preserve the first safe snapshot and update only explicitly allowed source
   revision/status fields.
8. Set `rootContextId` consistently and reject cycles or excessive hierarchy
   depth.
9. Return `resolutionState = unresolved` or `ambiguous` instead of guessing
   when the source cannot be proven.

`sourceId` is an immutable, normalized identity within a `(tenantId,
sourceType)` namespace. A source system that can reuse provider/job IDs must
include its non-reusable generation/attempt identifier in `sourceId` (or in a
registered `sourceRevision` identity rule); the resolver must reject an
identity collision whose authoritative source record is different. A title
change is not an identity change. The implementation must document the
normalization and reuse rule for every registered resolver.

The maximum ancestry depth is a named configuration constant (default `8` in
this feature). The resolver rejects deeper chains and records the rejection;
it must not truncate the chain and report it as complete. A `partial` context
is allowed only when the source itself is verified and the missing ancestry is
repairable. `unresolved` and `ambiguous` contexts never satisfy a required
attribution.

### 8.3 Atomic debit/link behavior

For every new debit/refund/reconciliation transaction, the lifecycle is:

1. Resolve and authorize the required context in a preflight transaction
   before any provider dispatch. This may persist a context row without yet
   creating a financial link.
2. Dispatch the provider only after required preflight succeeds.
3. Enter the existing credit transaction boundary with the resolved context,
   perform the idempotent ledger operation, and insert its links atomically.
4. Return the existing transaction result plus an internal context status.

The central writer must serialize idempotency-key handling and link creation
inside the same database transaction as the ledger operation. It must lock the
existing idempotency/transaction row when one is found (or use the repository's
equivalent serialization mechanism), validate the requested attribution against
the locked row, and insert links with `ON CONFLICT DO NOTHING` followed by an
exact link-integrity check. Two concurrent requests for the same idempotency
key must converge to one ledger row and one compatible link set; a concurrent
request with different tenant, primary context, or accounting role must fail
with an idempotency-conflict error. A unique constraint alone is not sufficient
evidence of correct balance and link behavior.

Before dispatch, the caller must persist or update a durable charge intent in
the existing provider/audit or job-intent boundary, keyed by the same
idempotency key and containing user, tenant, context identity, and contract
version. The intent is not a financial ledger and must not contain raw
payloads. If the process crashes after provider success but before the ledger
transaction, a reconciliation worker uses that intent/provider audit record to
retry the same idempotent debit or apply the existing safe refund policy. It
must not create a second provider call or a guessed context. A provider result
whose effective model/amount cannot be reconciled remains an explicit
provider/ledger mismatch for manual repair.

For paths with no provider dispatch, steps 1 and 3 remain one atomic database
operation. If preflight did not create the context row, the step-3 writer may
create/reuse it in the same database transaction as the ledger insert. It must
not rely on a separate successful request followed by a best-effort link insert
for a required attribution.

The context is re-resolved inside the ledger transaction as well as during
preflight. If its authoritative source revision, tenant, owner, or hierarchy
changed between dispatch and debit, the writer follows the idempotency/recovery
policy and never silently attaches a stale or foreign context.

If the debit succeeds but context linking cannot complete, the operation must
not issue a second debit. The recovery path must locate the ledger row by
idempotency key/transaction ID, create the missing context links idempotently,
and emit an unattributed/reconciliation metric until repaired. This repair
operation must be a named service boundary (for example
`repairCreditTransactionContext`) and must be safe to run from a retry job,
admin maintenance command, or request-time idempotency recovery.

### 8.4 Legacy metadata adapter

During migration and for callers that have not yet been converted, the credit
service may extract only allow-listed keys:

```text
tenantId
seriesId
episodeId
jobId
taskId
runId
skillRunId
conversationId
mediaTaskId
workerJobId
```

The adapter must use the same resolver and ownership checks as explicit
contexts. Metadata extraction is a compatibility bridge, not the long-term
contract. New callers must pass explicit `CreditAttribution`.

When an idempotency lookup returns an existing transaction from Redis or the
database, the central writer must still reconcile the requested context links
against that transaction before returning. A cached transaction result is not
proof that its context links exist. Reconciliation must be idempotent and must
never alter the existing amount or balance. If the requested tenant, primary
context identity, source revision, or accounting role conflicts with the
existing transaction, the writer must return an idempotency-conflict error and
create an audit/metric event; it must not attach the new context to the old
transaction merely because the idempotency key matched.

### 8.5 Authorized correction workflow

`provenance = "manual_review"` is reserved for an authenticated admin or
maintenance service using a named correction operation. It must require a
tenant-scoped transaction/context lookup, an explicit reason, the actor or
service identity, and before/after context references. The operation may add
or repair a link and update a safe snapshot only when persisted evidence is
provided; it must never change `amount`, `type`, `balanceAfter`, or the
original transaction's idempotency identity. Every correction is append-only
in the audit trail and is included in the next integrity report. Direct SQL
edits and client-supplied `manual_review` values are prohibited.

## 9. Billing integration coverage

### 9.1 Central boundaries

The following central functions become context-aware:

- `deductCredits`
- `deductCreditsForModel`
- `addCredits` when it creates a linked refund/reversal or explicitly linked
  work adjustment
- `refundCredits`
- reservation creation, draw settlement, commit, and refund paths
- Skill fixed-credit settlement and reversal paths
- transaction history/report queries

The existing `sourceType`, `skillSlug`, `skillRunId`, `conversationId`,
`traceId`, and metadata fields remain backward-compatible.

### 9.2 Skill calls

Every actual Skill charge must retain:

- canonical Skill slug;
- Skill display name through the existing registry join when available;
- stable, non-reused Skill run/attempt ID; if the caller has no durable
  Job/Task/Run, the writer must create a `skill_execution` context keyed by the
  stable run/attempt or idempotency identity before charging;
- exactly one primary Job/Task/Run or `skill_execution` context for every new
  user Skill debit;
- parent Series context when available;
- actual model and provider metadata for LLM Skills;
- stage, round, attempt, and scope where the caller already knows them.

`sourceType = "skill"` without a valid Skill slug or a stable execution
identity remains an error. The existing Skill billing invariant must continue
to fail closed. A legacy path may be `best_effort` only when explicitly
registered; it must not be the fallback for a new Skill caller that merely
failed to propagate its execution context.

### 9.3 LLM calls

Every actual billable LLM charge for a user account must attach the most
specific known context, regardless of whether it was initiated synchronously,
through a queue, by a background/scheduled job, through an API, or by a
Worker. The only deliberate exception is a system call that does not create a
user debit (for example `userId = 0`); such a call must not fabricate a user
context or a user transaction.

- Vertical Drama calls use the existing `seriesId`, `jobId`, `runId`, and
  attempt key from `chargeVerticalDramaLlmCall`.
- Structured Skill calls use `billingMetadata.skillSlug` and explicit context
  fields; a new call must fail preflight if it cannot resolve a primary
  Job/Task/Run or `skill_execution` context.
- Chat calls use a verified `conversationId` as the primary context when no
  workflow/job/run exists; if a workflow/job/run is known, it becomes the
  primary work context and conversation becomes a secondary link.
- Background or scheduled calls use their durable job/run context.
- A call without a work entity is valid only for an explicitly registered,
  audited legacy/general path classified as `best_effort`; it is marked
  unattributed and is never assigned to a Series by time or description. A
  new user Skill/LLM path without a work entity must fail the required
  precondition or first create a durable run/request context. The missing-
  context metric and caller inventory must identify whether the caller was
  chat, API, scheduler, Worker, or another runtime so an unattributed legacy
  row cannot be mistaken for an acceptable new path.

Every queue, scheduled-job, delegated-worker, and retry payload that can cause
a user charge must serialize a bounded `CreditAttribution` envelope with a
contract version, tenant, primary context reference, conversation reference
when applicable, and the original idempotency/attempt identity. The receiving
process must re-resolve and re-authorize the envelope; it must not trust a
display name, tenant supplied by a client, or a context ID copied from an
untrusted payload. Missing/unknown envelope versions or missing required
context fail before provider dispatch and debit. The envelope must not include
raw prompts, provider payloads, signed URLs, or credentials.

The model recorded in metadata must remain the actual effective model that
answered, including fallback behavior.

### 9.4 Reservations, retries, and refunds

Reservation IDs and idempotency keys are references, not substitutes for
context. A reservation must carry the same attribution through:

```text
reserve -> draw -> usage transaction -> commit/refund -> reconciliation
```

The durable reservation state (currently Redis-backed) must store the resolved
context identity needed for settlement/refund, including tenant, primary
context ID, root context ID when known, and conversation context ID when
applicable. It must not depend on re-parsing arbitrary metadata after the
reservation is created. If the reservation cache is lost, settlement/refund
must recover the attribution from the reservation transaction and its links or
enter explicit reconciliation; it must never create a context by guessing from
the reservation ID.

Under the current `creditService` contract, the reservation's initial
`transactionId` is the only user debit: `draw` changes the reservation budget,
`commit` creates no second debit, and an unused amount is represented by a
linked refund. This feature must not add a per-draw usage debit, or the report
would double-count reserved credits. If a future design introduces per-draw
ledger rows, it must first define an explicit reclassification/hold contract
and update the accounting predicate in a separate versioned change.

A retry with a new attempt key creates a new transaction linked to the same
parent work but a distinct Run/attempt context when available. Redelivery of
the same attempt remains idempotent and must not create another transaction or
link set.

Refund rows must link to the original transaction's context and populate the
reversal relationship where the existing refund contract identifies the
original transaction. The refund writer must derive the refund tenant from the
original ledger row, reject a caller-supplied tenant that differs, and require
the refund row, original row, and reversal context link to remain in the same
tenant boundary. If the original transaction has no provable tenant, the
refund follows the existing reconciliation policy and cannot be promoted to a
new required named attribution.

### 9.5 Fixed Skill revenue settlement

`skillRevenueBilling.ts` may create multiple ledger rows for one user Skill
run. The implementation must link them all without multiplying user cost:

```text
user debit                  relationType = primary_work
tenant revenue distribution relationType = revenue_distribution
owner revenue distribution  relationType = revenue_distribution
refund/reversal             relationType = reversal
```

The user report filters by the billing subject and counts only the user debit
and linked refund. Admin accounting can inspect distributions separately.

### 9.6 Required caller coverage audit

Before enabling the write flag, implementation must inventory every production
path that can create a user Skill/LLM debit. The inventory must include direct
calls and indirect wrappers for:

1. `deductCredits` and `deductCreditsForModel`;
2. `createCreditReservation`, reservation draw/commit/refund, and media/task
   reconciliation when the underlying charge is a Skill/LLM operation;
3. `chargeVerticalDramaLlmCall` and all Vertical Drama story, prompt, QC, and
   repair callers;
4. `callLLMStructured`, `llmRoutes`, `llmRoutesHandler`, `llmQueue`, and
   `responsesRoutes`;
5. `skillExecutor`, `teamRunSkillExecutor`, public Skill/API routes,
   scheduled jobs, Worker runtime, MCP/API adapters, and orchestration
   services;
6. direct `creditTransactions` inserts in fixed Skill settlement and any
   other billing service. Every such insert must be removed or routed through
   the central context-aware writer; a direct insert is permitted only in the
   implementation of that writer and its explicitly scoped database helper.

The implementation report must list each path, its primary context source,
its fallback/unattributed behavior, and its focused test. A static/AST guard
must prevent a new `sourceType = "skill"` path from omitting the canonical
Skill slug and must flag a new user Skill/LLM debit that bypasses the
context-aware central writer. The inventory is generated from all imports and
calls of `deductCredits`, `deductCreditsForModel`, `refundCredits`,
`createCreditReservation`, and direct `creditTransactions` inserts under
`apps/web/server`; a manually curated list alone is not sufficient.

Every discovered caller must be classified as one of `user_skill_llm_charge`,
`user_media_charge`, `revenue_distribution`, `system_charge`, or
`non-billing/test`. Known direct-insert exceptions such as creator-revenue
settlement and generic database import helpers must be explicitly classified,
covered by a test, and either routed through the context-aware writer or
proven not to create a user debit. The inventory gate fails if a new caller is
unclassified, if a user charge has no tenant-time provenance, or if a direct
ledger insert bypasses the central writer.

The inventory must be reproducible through a read-only command at
`apps/web/scripts/audit-credit-context-callers.ts` (or the repository's
approved equivalent), with machine-readable `--format json` output and a
non-zero `--fail-on-unclassified` mode for CI. Each record must contain the
resolved file and line, imported/exported boundary, call kind, classification,
source-type expression, context/tenant propagation status, and focused-test
reference. The report must include production callers and separately label
tests/examples; it must detect aliases and wrapper calls rather than relying on
one literal function name. A release artifact must record the commit/schema
version used to generate it so a later code change cannot silently reuse a
stale inventory.

Implementation deliverables are locked to these owned paths: schema/migration
changes under `apps/web/drizzle/`; shared types at
`apps/web/shared/creditContext.ts`; resolver and repair logic at
`apps/web/server/services/creditContextService.ts`; central billing changes at
`apps/web/server/services/creditService.ts` and the listed billing callers;
report procedures at `apps/web/server/routers/credits.ts`; and presentation at
`apps/web/shared/creditTransactionSource.ts` plus
`apps/web/client/src/pages/Credits.tsx`. Operational documentation must be
maintained at `docs/runbooks/credit-context-lineage-rollout.md`, and the
implementation report must identify the existing audit/metrics integration
points used for this feature. The caller-audit deliverable and its generated
JSON evidence must be retained with the implementation report. Focused tests
must include resolver,
atomic writer, caller-inventory/static guard, migration/backfill, report/export,
and Credits UI/browser cases. No implementation may silently move this scope
to an untracked parallel service.

## 10. Historical migration and backfill

### 10.1 Migration artifact

Create the next repository migration, expected to be the next unused migration
after `0263_free_plan_assignment`:

```text
apps/web/drizzle/0264_credit_context_polymorphic_lineage.sql
```

The exact sequence must be checked against the migration journal immediately
before implementation. The migration must be additive and idempotent where
the repository's migration conventions allow it.

Each DDL step must be safe to re-enter after an interrupted deployment:
`IF NOT EXISTS`/equivalent checks may be used only after verifying the existing
object has the required type and constraint semantics. A pre-existing object
with an incompatible definition is a migration failure requiring operator
repair, not a reason to silently continue. The migration must record/verify
the schema version before report or strict-write flags can be enabled.

It creates:

1. `credit_contexts`
2. `credit_transaction_contexts`
3. `credit_context_backfill_runs` for durable checkpoint, mode, counters,
   operator, and parity evidence; this is operational metadata, not a ledger
4. `credit_transactions.tenantId` and `credit_transactions.reversalOfTransactionId`
5. required indexes, constraints, and bounded check constraints
6. any registered context-type seed/config needed by the resolver

All context IDs and context self/link foreign keys must use the same
PostgreSQL `uuid` type in SQL and the matching Drizzle `uuid(...)` definitions,
with `gen_random_uuid()` as the database default for generated IDs. The
migration must verify the `pg_type`/constraint shape before treating an
existing object as compatible; it must not mix `varchar(36)` and `uuid` across
the new foreign keys or rely on an application-only default.

It must not update `users.credits`, delete credit transactions, change
`balanceAfter`, or rewrite the financial amount/type.

Indexes added to the existing `credit_transactions` table must use the
repository's safe online/index-lock convention. If the migration runner cannot
create them concurrently, they must be a separate additive pre-report step
with its own completion check; `CREDIT_CONTEXT_REPORT_ENABLED` cannot turn on
until all required indexes exist and are valid.

The database migration is schema-only. It must not scan or backfill the entire
`credit_transactions` table inside the deploy migration transaction. Historical
backfill is a separate, resumable maintenance operation after the schema is
available. This prevents a large legacy table from extending migration locks
or causing an application startup timeout.

### 10.2 Verified backfill sources

Backfill may use, in descending confidence:

1. Existing structured metadata fields such as `seriesId`, `jobId`, `taskId`,
   `runId`, `skillRunId`, and `conversationId`.
2. Existing `skillRevenueSettlements` relationships for user debit and
   reversal rows.
3. Existing durable run/task tables with matching idempotency key, trace ID,
   media task ID, or run ID.
4. Existing ownership and source rows to resolve authoritative titles.

Backfill must require:

- transaction user ownership;
- tenant match when tenant is present;
- source existence or a provable historical source snapshot;
- source type/ID consistency;
- no conflicting Series/tenant/user references.

### 10.3 Explicitly prohibited backfill behavior

Never assign a transaction to a Series based only on:

- transaction timestamp;
- description text;
- matching Skill slug;
- same user;
- nearest job;
- provider trace text without source ownership proof.

Rows that cannot be proven become `unattributed` or `ambiguous` in the audit
report. This is an expected data-quality outcome, not a migration failure.

### 10.4 Backfill execution and evidence

The backfill must run in bounded batches and be restartable. Before and after
counts must be recorded:

```text
credit transactions scanned
contexts created/reused
transaction links created
links skipped for ownership mismatch
links skipped for missing source
ambiguous/unattributed rows
duplicate/idempotent reruns
```

Checkpoint and counters must be persisted in
`credit_context_backfill_runs`, not only in process memory or a local file.
The run row records a unique run ID, mode (`dry_run`, `canary`, `apply`,
`audit`), keyset cursor, schema version, operator/service identity, start/end
time, status (`running`, `paused`, `completed`, `failed`, `cancelled`), and
the counters above. Resume is allowed only when the schema version and
attribution rules match the run; otherwise the tool starts a new run and
reports the reason.

The migration verification must prove:

1. User balance totals are unchanged.
2. Credit transaction count and amounts are unchanged.
3. No cross-tenant context links exist.
4. No link points to a missing context.
5. No transaction has more than one `isPrimary` link.
6. Re-running the backfill creates no duplicate context/link rows.
7. Historical title snapshots are bounded and do not contain secrets/raw
   prompts.

The backfill operation must have an explicit dry-run mode and a stable
checkpoint (keyset by transaction ID, not offset). It must support pause,
resume, retry, and a final integrity audit. Metadata values must be validated
before numeric/UUID conversion; malformed JSON values, non-integer Series IDs,
oversized IDs, and invalid timestamps must be skipped and counted rather than
causing the whole migration to fail.

Each apply batch must use one database transaction for its verified
`credit_transactions.tenantId` updates, context upserts, and link inserts.
Live writer races are resolved by row-level locking or an equivalent
serialization rule plus idempotent `ON CONFLICT` behavior; the backfill must
never overwrite a newer explicit context, tenant, snapshot, or reversal link.
Dry-run and apply must share the same candidate-resolution code path, with
dry-run suppressing writes, so candidate counts are reproducible. A batch
cursor is advanced only after all of its writes and counters are committed.

Historical candidates that resolve from persisted evidence are written with
`resolutionState = historical_resolved` and `provenance =
historical_verified` plus the resolver version that produced the evidence;
candidates that do not meet the evidence rules produce a
reason-coded disposition and remain unchanged in the ledger. Each candidate
must end in exactly one disposition: `linked`, `already_linked`,
`skipped_permanent`, or `deferred_retryable`. Permanent skip codes include
`malformed_metadata`, `unsafe_id`, `unsupported_source_type`,
`ownership_mismatch`, `tenant_ambiguous`, `conflicting_evidence`, and
`source_missing`; retryable codes include `source_temporarily_unavailable`,
`database_timeout`, and `lease_conflict`. A retryable candidate must not be
counted as final unattributed data quality until its retry policy is exhausted.
The run counters and audit output must aggregate both disposition and reason
code, and a resume must retry only retryable candidates without re-writing
verified links. The backfill must never
upgrade an `unresolved`/`ambiguous` context to verified merely because a later
batch found a similarly named source.

Before production backfill, operators must capture a recoverable database
backup or snapshot, record ledger/balance parity counts, run the dry-run, and
approve a canary batch. After the canary and final batch, compare transaction
counts, amount sums, user balances, link counts, tenant mismatch counts, and
unattributed counts. A restore rehearsal or documented restore validation is
required for the production migration runbook.

The repository deliverables are an extension of the existing source backfill
tool at `apps/web/scripts/backfill-credit-transaction-sources.ts` only for
legacy source normalization, plus a separate lineage tool at
`apps/web/scripts/backfill-credit-context-lineage.ts` and a read-only audit
tool at `apps/web/scripts/audit-credit-context-lineage.ts`. The lineage tool
must expose `--dry-run` by default, `--apply`, `--batch-size`, `--start-id`,
`--run-id`, `--pause-after-batch`, and `--tenant-id`/`--user-id` filters, and
must print the run ID, immutable scan-through transaction ID, and resumable
cursor on every batch. No operator command may require editing SQL by hand to
resume a run.

### 10.5 Rollback posture

The rollout is forward-compatible and feature-flagged. If context writes or
reports fail, disable context presentation/report reads while leaving the
existing credit ledger and billing paths operational. Do not drop context
tables or reversal columns after any writes have occurred. A destructive
rollback requires an approved database restore to the captured backup and a
parity check; it is not an automatic down migration.

## 11. Report API

### 11.1 Transaction history response

Extend the existing `credits.history` and admin history response with a safe
context presentation object:

```ts
{
  context: {
    status: "linked" | "partial" | "unattributed" | "ambiguous",
    primaryLabel: string | null,
    rootLabel: string | null,
    workTypeLabel: string | null,
    stageLabel: string | null,
    technicalRefsAvailable: boolean,
  }
}
```

Normal history responses must not use `SeriesID` as the primary label. Source
IDs may be returned only as non-display machine keys in an authorized,
tenant-scoped history/report response or as technical references in an audit
detail. They must never be rendered as the normal label and must still be
tenant/user-scoped.

The response continues to return the existing Skill name, Skill slug,
conversation title, source type, sanitized metadata, trace ID, and balance.

The account-level `credits.history` endpoint remains compatible with the
existing user ledger behavior. Context-bearing rows are shown only when the
authenticated user is authorized for the context's tenant. If a transaction
itself is visible but its context is not authorized or cannot be resolved, the
transaction remains in the existing history response with a localized
unattributed context object; the server must not leak the context title, ID, or
metadata and must not silently move the transaction to another tenant. The
`credits.usageByContext` report is always scoped to the authenticated current
tenant; it must reject a context from another tenant even when the same user
has access to more than one tenant. An explicitly authorized admin endpoint
may select a tenant and user only through the existing admin policy. The admin
surface must be explicit rather than overloading the self-service input: use
`credits.adminUsageByContext` with `{ tenantId, userId?, ...usageByContextInput }`,
return the same response contract with `scope: "tenant"` or `scope: "user"`,
and require an existing tenant-admin permission plus an audit event containing
the operator, target tenant, optional target user, filters, and
`asOfTransactionId`. The server must apply the target tenant predicate to both
ledger rows and context rows before aggregation; `userId` is an optional
narrowing filter and must never broaden access across tenants.

The implementation must use the repository's existing `auditLogger.log`
boundary (not a new untracked audit store), with a named event type and
sanitized metadata; audit logging failure follows the existing best-effort
policy but must emit an operational error metric.

The server maps context state to presentation state consistently:
`resolved`, `historical_resolved`, and `archived` become `linked`;
`partial` becomes `partial`; `ambiguous` becomes `ambiguous`; and
`unresolved` becomes `unattributed`. An `unresolved` row never receives a
named root label or enters a named work total, even if a client supplies a
display hint.

### 11.2 Usage-by-work report

Add a protected report query named `credits.usageByContext` with this input
contract:

```ts
{
  startDate?: Date;
  endDate?: Date;
  contextType?: CreditContextType;
  rootContextId?: string;
  transactionSourceType?: PersistedCreditSourceType;
  contextSourceType?: CreditContextSourceType;
  skillSlug?: string;
  includeUnattributed?: boolean;
  asOfTransactionId?: number;
  limit?: number;
  offset?: number;
}
```

The server applies defaults `limit = 50`, `offset = 0`,
`includeUnattributed = false`, and a maximum `limit = 100`. Dates use
UTC-inclusive `startDate` and exclusive `endDate`
semantics after normalization; it rejects an end before the start and applies
a configured maximum interactive range. Results are ordered deterministically
by `netActualCredits DESC`, then `rootContextId ASC NULLS LAST`,
`attributionStatus ASC`, and `primaryContextId ASC`.

`contextType` and `contextSourceType` filters are validated against the context
registry/allowlist, while `transactionSourceType` is validated against the
persisted values of the existing `creditSourceTypeEnum`. These are separate
namespaces: for example,
`transactionSourceType = "skill"` may be paired with
`contextSourceType = "vertical_drama_story_generation_run"`. Unknown values
are rejected as invalid input; they are never interpolated into SQL or treated
as an unresolved wildcard.

The response contract is:

```ts
{
  scope: "self" | "user" | "tenant";
  distinctUserCount: number;
  rows: Array<{
    rootContextId: string | null;
    rootLabel: string | null;
    primaryContextId: string | null;
    primaryWorkLabel: string | null;
    attributionStatus: "linked" | "partial" | "unattributed" | "ambiguous";
    chargedCredits: number;
    refundedCredits: number;
    netActualCredits: number;
    usageTransactionCount: number;
    refundTransactionCount: number;
    adjustmentTransactionCount: number;
    firstUsedAt: Date | null;
    lastUsedAt: Date | null;
    byWork: Array<{
      contextId: string;
      workType: string;
      workLabel: string;
      chargedCredits: number;
      refundedCredits: number;
      netActualCredits: number;
      transactionCount: number;
    }>;
    bySourceType: Array<{
      sourceType: PersistedCreditSourceType | null;
      chargedCredits: number;
      refundedCredits: number;
      netActualCredits: number;
      count: number;
    }>;
    byContextSourceType: Array<{
      contextSourceType: CreditContextSourceType | null;
      chargedCredits: number;
      refundedCredits: number;
      netActualCredits: number;
      count: number;
    }>;
    bySkill: Array<{
      skillSlug: string | null;
      skillName: string | null;
      chargedCredits: number;
      refundedCredits: number;
      netActualCredits: number;
      count: number;
    }>;
    byModel: Array<{
      model: string | null;
      provider: string | null;
      chargedCredits: number;
      refundedCredits: number;
      netActualCredits: number;
      count: number;
    }>;
    byStage: Array<{
      stageLabel: string | null;
      chargedCredits: number;
      refundedCredits: number;
      netActualCredits: number;
      count: number;
    }>;
  }>;
  totals: {
    chargedCredits: number;
    refundedCredits: number;
    netActualCredits: number;
    usageTransactionCount: number;
    refundTransactionCount: number;
    adjustmentTransactionCount: number;
    unattributedTransactionCount: number;
    ambiguousTransactionCount: number;
    unattributedChargedCredits: number;
    unattributedRefundedCredits: number;
    unattributedNetActualCredits: number;
    ambiguousChargedCredits: number;
    ambiguousRefundedCredits: number;
    ambiguousNetActualCredits: number;
    integrityExceptionTransactionCount: number;
    integrityExceptionCredits: number;
  };
  pagination: {
    limit: number;
    offset: number;
    hasMore: boolean;
    nextOffset: number | null;
    asOfTransactionId: number;
  };
}
```

`rootContextId = null` is an unattributed or ambiguous bucket only when the
caller explicitly requests `includeUnattributed = true`; it must never be
silently mixed into a named Series total. Null-root rows are grouped by
`attributionStatus` as well as root, so unattributed and ambiguous amounts
cannot collapse into one indistinguishable row. The implementation may expose
a separate data-quality row instead of a bucket. The flat `totals` fields cover
all qualifying transactions matching the filters, while the explicit
unattributed/ambiguous amount fields separate rows that are not represented by
a named root. Therefore a page with `includeUnattributed = false` can have
visible rows whose sum is lower than `totals`; the UI must show the data-quality
amounts rather than silently presenting the visible rows as complete.

`totals` covers all transactions matching the filters, not only the current
page. `rows` is the requested page of named root-context groups. The
`pagination` fields describe only `rows`; a client must not recalculate global
totals from the visible page.

The first report request captures the current maximum transaction ID as an
immutable `asOfTransactionId` unless the caller supplies one. Every subsequent
page, detail request, and export derived from that report must reuse the same
watermark. Transactions created after the watermark are handled by a later
report snapshot; this prevents totals and pages from changing underneath the
user while a report is being reviewed.

When dates are omitted, the report defaults to the last 30 UTC calendar days
to keep the interactive query bounded; an explicit date range is required for
an all-history export. Scope is deterministic: a normal caller of
`credits.usageByContext` is `scope: "self"` and the server applies both the
authenticated `userId` and current tenant from auth; the client cannot
override either. `credits.adminUsageByContext` is `scope: "user"` when its
authorized `userId` filter is present and `scope: "tenant"` when it is absent,
and it always requires an authorized target tenant. Admin views may select a
user only through the existing admin authorization boundary. The response's
`distinctUserCount` is therefore `1` for a non-empty self/user scope and is
the distinct authorized user count only for a tenant-wide admin scope.

Tenant filtering uses `credit_transactions.tenantId` for new rows. A legacy
row with null transaction tenant may enter a tenant report only when its
verified context link proves the same tenant and its provenance is
`historical_verified` or `manual_review`; an unlinked null-tenant row is not
silently assigned to the current tenant and is surfaced only in an authorized
global data-quality report.

Each grouped result contains:

```text
rootContextId          opaque machine key, not a primary UI label
rootLabel              live authoritative title or snapshot fallback
primaryContextId       opaque machine key for authorized detail navigation;
                       null when one root has multiple primary contexts
primaryWorkLabel       Job/Task/Run label; null when one root has multiple
                       distinct primary work labels
chargedCredits         gross negative usage debits
refundedCredits        positive linked refunds
netActualCredits       charged minus refunds
usageTransactionCount  distinct user debit transactions
refundTransactionCount distinct linked refunds
adjustmentTransactionCount distinct allow-listed work adjustments
firstUsedAt
lastUsedAt
bySourceType
byContextSourceType
bySkill
byModel/stage when available and authorized
attributionStatus
```

The query must count distinct financial transaction IDs and aggregate through
the primary/root context rules so parent links do not multiply amounts. A
detail query for one root context must use the same UTC date semantics and
must return stable transaction ordering by `createdAt DESC, id DESC`.
`rootContextId`, `primaryContextId`, and nested `byWork.contextId` are opaque
machine keys for authorized navigation only; all report labels are resolved
server-side and all supplied IDs are checked against the authenticated tenant.

`byWork` contains only primary-work attribution for cost aggregation. Parent,
root, execution, and conversation links may be returned as explanatory
metadata but must not create additional amount-bearing `byWork` entries. Every
`bySourceType`, `byContextSourceType`, `bySkill`, and `byWork.transactionCount`
are distinct ledger transaction counts; subgroup sums are not an alternative
financial ledger.

The inclusion predicate is explicit: usage costs are `type = "usage"` with
negative `amount`; refunds are `type = "refund"` with positive `amount` and a
valid `reversal` link to the original work; and an `adjustment` row is included
only when it has a `work_adjustment` link and an allow-listed accounting rule.
Other transaction types are excluded from production-cost totals. A refund or
adjustment without a proven work relationship remains visible only in the
unattributed/ambiguous data-quality totals and is never assigned to a named
root. Reversal amount/ownership violations are visible in the explicit
integrity-exception totals and are not included in charged, refunded, or net
named-work totals until repaired.

### 11.3 Detailed work report

Add a protected `credits.contextUsageDetail` query with
`{ contextId, startDate?, endDate?, includeUnattributed?, asOfTransactionId? }`;
the default for
`includeUnattributed` is false. The server must
verify that `contextId` belongs to the current tenant and that the caller can
read the source before returning any row or label. The report must support a
selected Series/Job/Run detail view containing:

- total gross charged credits;
- total refund credits;
- net actual credits;
- chronological transaction list;
- Skill and model breakdown;
- stage/episode/scope breakdown when present;
- retry count and attempt keys in authorized audit detail;
- unattributed or ambiguous related rows not included in the selected total;
- explicit data completeness status.

The report must state that it is actual platform credit usage, not provider USD
cost.

Self-service detail is always derived from the authenticated user and tenant.
Tenant-admin detail must use a separate explicit
`credits.adminContextUsageDetail` surface with
`{ tenantId, userId?, contextId, ... }`, the same target-scope authorization as
`credits.adminUsageByContext`, and a required audit event. The server must
apply the target tenant/user predicates before resolving labels or transactions;
an admin context ID alone is never sufficient authorization. The selected
scope and watermark must be returned with the detail response.

Add a protected `credits.exportUsageByContext` query/action that accepts the
same tenant-scoped filters and accounting semantics, requires an explicit date
range, and streams a bounded CSV or equivalent downloadable report. The
interactive export range is limited by `CREDIT_CONTEXT_MAX_EXPORT_DAYS`
(default `366`); a request beyond that limit returns a typed validation error
or must be handed to an explicitly authorized asynchronous export job. Export
columns use human-readable labels and actual charged/refunded/net values; raw
context IDs are omitted unless the caller has the existing technical-audit
permission. Export totals must be generated from the same query service as the
interactive report so the two surfaces cannot diverge.
The export captures and returns its own `asOfTransactionId` watermark in the
audit metadata; an export requested from a visible report may reuse that
report's watermark. If the range exceeds the interactive limit and an
asynchronous export is authorized, the export job must persist only a bounded
query specification plus watermark (never raw prompts/provider payloads), bind
the job to the requesting user and tenant, enforce the same permission at
download time, use a short configurable expiry, and delete or invalidate the
artifact after expiry or download. Job status and download errors must not
reveal another tenant's existence or technical IDs.
Admin export uses an explicit `credits.adminExportUsageByContext` surface with
the same target tenant/user authorization and audit requirements as the admin
summary/detail surfaces; a self-service export must never accept an admin
tenant or user selector.

The API uses stable typed errors for invalid date range, foreign/unauthorized
context, missing tenant scope, export-range overflow, and unavailable report
dependencies. Error payloads contain no raw source IDs, titles, prompts, or
provider details beyond the existing sanitized error contract.

## 12. Credits page and user experience

### 12.1 Transaction rows

The existing `/credits` page keeps its current mobile and desktop layouts but
adds context presentation:

```text
เรื่อง: รักลวงใจ
งาน: สร้างบทและตรวจคุณภาพ
ขั้นตอน: QC รอบที่ 2
เครดิต: -30
```

Display precedence:

1. Current authorized source title;
2. Safe `displayNameSnapshot`;
3. Work label from the context type;
4. Existing Skill name/description;
5. Localized “ไม่ระบุงาน” / “Unattributed”.

Raw IDs must not replace the display label. The audit dialog may show
technical references behind an explicit detail action.

### 12.2 Summary section

Add a summary section to the Credits page, or an existing linked usage-report
surface if the current layout already owns that concern. For this feature, the
default placement is the existing Transaction History card in
`apps/web/client/src/pages/Credits.tsx`, above the paginated transaction list.
It must show:

- current selected date range;
- total charged credits;
- total refunded credits;
- net actual credits;
- top Series/works by net usage;
- an unattributed count and link/filter;
- an integrity-exception count and amount, with a data-quality link/filter
  that is distinct from production cost;
- clear distinction between `charged`, `refunded`, and `net used`.

Because the default report hides unattributed/ambiguous rows from the named
list, the UI must label whether each total is `all matching transactions` or
`named work only`. It must show unattributed and ambiguous credits separately
when they are non-zero; it must never imply that the visible top-work rows
alone explain the entire account total.

The report controls must bind directly to the report input contract: UTC start
and exclusive end date, transaction source/context source filters, Skill slug
filter when applicable, an explicit include-unattributed toggle, pagination,
and refresh. Changing any filter resets the report offset to zero and obtains
a new watermark; paging, opening a work detail, and exporting from the same
view reuse the captured `asOfTransactionId`. A named work row must provide an
authorized path to `credits.contextUsageDetail`; the detail view must preserve
the selected filters/watermark and provide a clear return path. Export must be
disabled until an explicit valid date range is selected and must surface the
typed range/permission error without downloading a partial file.

The summary must not imply that a positive purchase or Skill-owner revenue row
is production cost.

If the current tenant cannot be resolved, the work summary must fail closed
with a localized tenant-context error while the account-level balance/history
continues to follow its existing behavior. The UI must never fall back to
showing raw context IDs or another tenant's title.

### 12.3 Localization and accessibility

Add Thai and English labels for:

- Work / เรื่อง / งาน;
- charged credits;
- refunded credits;
- net actual credits;
- unattributed;
- ambiguous;
- integrity exception / รายการผิดปกติทางบัญชี;
- archived work;
- actual platform credits;
- technical audit references.

Tables and cards must retain keyboard access, readable labels, loading state,
empty state, error state, and responsive behavior. Existing Credits UI
patterns and shared source presentation helpers remain authoritative.

## 13. Security and privacy

1. Missing tenant identity fails closed for tenant-scoped work contexts.
2. Every context read requires tenant scope and user/role authorization.
3. A transaction link must satisfy `credit_transactions.tenantId =
   credit_contexts.tenantId` and the permitted transaction owner; a legacy
   transaction with null tenant cannot be used for a new required charge.
4. User reports cannot accept arbitrary `userId`, `tenantId`, `contextId`, or
   `sourceId` to bypass auth.
5. Source resolvers must verify the source entity's tenant and ownership before
   loading its title.
6. Admin reports preserve tenant boundaries and explicitly document any
   cross-user aggregation allowed by admin policy.
7. Context snapshots are allow-listed and size-limited.
8. Do not store raw prompt content, provider response bodies, signed URLs,
   access tokens, API keys, cookies, or credential-bearing URLs.
9. Technical IDs and provider/model data appear only in authorized detail
   surfaces already protected by the existing audit contract.
10. A deleted/archived source does not make another tenant's old title
    readable; the snapshot remains visible only to authorized transaction
    owners/admins.
11. A caller cannot create an arbitrary `unresolved` context and then use it
    to satisfy a required attribution; unresolved contexts are diagnostic
    records and are not valid primary work contexts for new charges.
12. Historical snapshots are treated as user data: sanitize control characters,
    enforce length limits, and apply the existing user/admin access policy.

## 14. Failure modes and recovery

| Failure | Required behavior |
|---|---|
| Context source missing during a new charge | A `required` path fails before provider/debit work; an explicitly audited `best_effort` path may charge, marks the row unattributed, emits a metric, and never guesses a Series |
| Context source belongs to another tenant/user | Reject context creation/link; do not charge a request that requires the context, or follow the existing safe failure policy before provider work |
| Context upsert races | Unique `(tenantId, contextKey)` returns/reuses one context; link insertion is idempotent |
| Debit succeeds but link insert times out | Reconcile by transaction ID/idempotency key; do not debit again |
| Provider succeeds but the debit transaction fails | Follow the existing billing reconciliation/refund policy; do not invent a second charge or context, and record the provider/ledger mismatch for repair |
| Duplicate provider/job delivery | Existing idempotency returns the same transaction; no duplicate primary link |
| Retry is a new attempt | New transaction and new attempt context, same parent/root context |
| Refund cannot find original transaction | Preserve the existing refund policy, create no guessed context link, mark the refund partial/unattributed, and emit reconciliation work |
| Source renamed | Use current authorized title for normal display and retain original snapshot for audit |
| Source archived/deleted | Mark context archived; retain links and snapshot; never delete financial history |
| Context hierarchy cycle/depth overflow | Reject the invalid context and record a bounded diagnostic |
| Report join produces duplicate rows | Query by primary/root rules and distinct transaction IDs; add regression test |
| Historical metadata is ambiguous | Mark `ambiguous`/`unattributed`; include in data-quality report, not in a guessed Series total |
| Database migration partially applied | Migration remains additive/restart-safe; existing credit paths remain operational and feature flag stays read-only/off |
| Context report is stale or unavailable | Transaction history remains available from the existing ledger; show report error without changing balances |

## 15. Performance and scale

1. Use indexed relational keys for recurring history/report queries; JSON
   metadata extraction is limited to migration/compatibility paths.
2. Avoid recursive CTEs in the common report path by storing
   `credit_contexts.rootContextId`.
3. Use pagination for transaction and context detail lists.
4. Use bounded `limit` values and server-side filters.
5. Aggregate by distinct transaction ID and use the primary/root context link
   to prevent join multiplication.
6. Backfill in batches with progress checkpoints and no long table-wide lock.
7. At 10x current volume, indexed joins and grouped queries remain the default
   path.
8. At very high volume, a read-only summary/materialized view may be added,
   but it must be rebuildable from `credit_transactions` and context links and
   must never become the financial authority.
9. Monitor query latency, link creation failures, orphan links, unresolved
   contexts, and unattributed new transactions.

The implementation must capture `EXPLAIN (ANALYZE, BUFFERS)` for the default
history, usage-by-context, detail, and export queries against a representative
10x fixture. Interactive report queries must meet the named
`CREDIT_CONTEXT_REPORT_P95_BUDGET_MS` budget (default `500` ms) for the default
page size, or the rollout remains report-disabled until the query/index design
is corrected. Export jobs use a separate bounded-job budget and must not block
interactive requests.

## 16. Rollout plan

### Phase 1 — schema and read-only infrastructure

1. Add schema types and migration.
2. Add context resolver, validation, and link writer.
3. Add integrity/orphan audit queries.
4. Deploy with `CREDIT_CONTEXT_WRITE_ENABLED=false`,
   `CREDIT_CONTEXT_REPORT_ENABLED=false`, and
   `CREDIT_CONTEXT_STRICT_REQUIRED=false`; these flags must not change
   balances when off.

### Phase 2 — central billing integration

1. Update `deductCredits` and `deductCreditsForModel`.
2. Update refund/reservation/reconciliation paths.
3. Update Skill revenue settlement.
4. Update Vertical Drama LLM billing helper.
5. Add context support to remaining central LLM/Skill callers.
6. Measure new unattributed rate before enabling reports.
7. Enable `CREDIT_CONTEXT_STRICT_REQUIRED` per audited caller cohort only after
   the caller coverage inventory and preflight tests pass.

### Phase 3 — historical backfill

1. Run a dry-run report with candidate counts only.
2. Verify user/tenant/source ownership.
3. Backfill verified contexts and links in batches.
4. Compare before/after ledger counts, amounts, balances, and duplicate rates.
5. Publish an explicit unattributed/ambiguous report.
6. Keep `CREDIT_CONTEXT_REPORT_ENABLED=false` until parity and tenant-isolation
   checks pass for the canary and final batch.

### Phase 4 — API and UI

1. Add safe context fields to transaction history.
2. Add usage-by-work report API.
3. Add Credits page labels and summary.
4. Run authenticated browser verification for history, filters, summary,
   empty/error states, and audit details.

### Phase 5 — operational enforcement

1. Alert on missing context for new required Skill/LLM paths.
2. Add CI/static checks for direct Skill/LLM billing calls that omit the
   attribution contract where context is available.
3. Keep unattributed legacy rows visible and do not silently rewrite them.

No deployment, production migration, or production backfill is part of the
local implementation unless separately approved. A production rollout must
include a recoverable database backup, dry-run counts, migration logs, and
post-migration balance/ledger parity checks.

## 17. Testing strategy

### 17.1 Schema and migration tests

1. The three new tables, ledger columns, indexes, constraints, and
   self-references exist.
2. Context key uniqueness is tenant-scoped.
3. Primary-link uniqueness is enforced.
4. Context deletion is restricted/archived according to retention rules.
5. Migration does not change user balances or transaction amounts.
6. Backfill is idempotent and produces stable counts.
7. Invalid cross-tenant and cross-user links are rejected.
8. Malformed metadata and unsafe ID conversions are skipped and counted,
   rather than aborting the entire backfill.
9. Dry-run, canary, pause/resume, and final parity evidence are available.
10. A second apply run for the same scope is rejected while the first active
    lease exists, and a paused/stale run can resume without duplicating rows.
11. New user-owned ledger writes require a transaction-time tenant, while
    legacy/system null-tenant rows remain explicitly classified and cannot
    satisfy a new required attribution.
12. The previous application version can start against the expanded schema,
    and required report indexes are valid before report rollout.
13. Context/link/run ID column types and defaults match between generated
    Drizzle metadata and the applied SQL, including every self/FK reference.
14. Backfill disposition/reason codes distinguish permanent skips from
    retryable deferrals and remain stable across pause/resume.

### 17.2 Context resolver tests

1. Series title resolves from the authoritative table.
2. Job/Run parent and root contexts resolve correctly.
3. Numeric, UUID, and string IDs are namespaced without collision.
4. Client display-name hints cannot override server titles.
5. Missing, archived, ambiguous, and unknown sources produce the correct state.
6. Cycles, excessive depth, oversized names, and unsafe snapshot values fail
   safely.
7. `resolved`, `partial`, `ambiguous`, `historical_resolved`, and `archived`
   state transitions follow the locked transition matrix.
8. Root contexts point to themselves, non-root contexts resolve to a root in
   the same tenant, cross-tenant parent/root links are rejected, and hierarchy
   cycles cannot be committed.
9. Source archive/delete reconciliation is idempotent, does not react to a
   transient lookup failure, preserves the first safe display snapshot, and
   leaves all financial links unchanged.
10. Every state transition and resolver/archive/correction failure emits a
    sanitized audit event and the audit failure metric without blocking a
    successful financial operation.
11. Each registered resolver declares one deterministic root/parent/required
    ancestry policy, and temporary source unavailability does not transition
    a context to `archived`.

### 17.3 Billing tests

1. A normal LLM debit creates one transaction and one primary context link.
2. A Vertical Drama LLM attempt links Series, Job, Run, stage, and attempt
   metadata where available.
3. A Skill debit requires a valid Skill slug and propagates context.
4. Fixed Skill settlement links user debit and revenue distribution rows but
   user report counts only the user debit.
5. Reservation draw/commit/refund preserves context.
6. Refund links to the original work and reduces net actual credits.
7. Duplicate idempotency returns existing transaction/link state.
8. Retry with a new attempt key produces a separate transaction.
9. Provider failure/refund does not leave a guessed or duplicate charge.
10. Existing calls with no known work context remain backward-compatible and
    are explicitly unattributed.
11. A required invalid/foreign context fails before provider/debit work, while
    an audited best-effort legacy path becomes unattributed with a metric.
12. Redis/database idempotency cache hits repair missing links without creating
    a second transaction or changing the balance.
13. A cache-hit attribution conflict is rejected and audited rather than
   attaching a different context.
14. Concurrent requests with the same idempotency key converge to one ledger
   row and one compatible primary link, while a conflicting concurrent request
   is rejected without changing amount or balance.
15. Queue/Worker envelope version loss fails before provider/debit work, and a
   valid envelope is re-authorized by the receiving process.
16. Provider success followed by ledger failure produces reconciliation data
   without a duplicate charge.
17. Existing admin add/deduct paths remain outside production-cost totals,
   including compatibility rows whose source/type is `admin` or whose
   metadata marks an admin adjustment, unless an explicit allow-listed
   `work_adjustment` contract is used.
18. The caller inventory command detects direct calls, aliases, and wrappers,
   emits the required JSON fields and commit/schema provenance, and fails CI
   when a production caller is unclassified or bypasses the central writer.

### 17.4 Report/API tests

1. User cannot read another user's or tenant's context/report.
2. History returns title/work label instead of raw Series ID as primary text.
3. Current title and snapshot fallback behave correctly.
4. Charged, refunded, and net totals are correct.
5. Parent/root links do not double-count a transaction.
6. Revenue distribution rows do not inflate user production cost.
7. Unattributed and ambiguous rows are reported separately.
8. Filters, pagination, stable ordering, and date boundaries work.
9. Admin scope is explicit and tenant-safe: `credits.adminUsageByContext`
   requires the existing tenant-admin permission, applies the target tenant
   predicate before aggregation, returns `scope` and `distinctUserCount`, and
   writes an audit event for the operator, target tenant/user, filters, and
   watermark.
10. Named-row totals, unattributed totals, ambiguous totals, and combined
    totals reconcile to the same direct-ledger fixture.
11. CSV/export output uses the same totals and does not leak tenant data or
    technical IDs without permission.
12. The same `asOfTransactionId` yields stable page membership and totals even
    when new transactions are inserted afterward.
13. Allow-listed and rejected work adjustments follow the accounting predicate
   and update adjustment counts without double-counting.
14. `byModel` and `byStage` breakdowns are deterministic, omit unavailable
   values safely, and never expose provider or model metadata outside the
   caller's existing authorization scope.
15. Admin report audit events use the existing audit logger with sanitized
   target/filter metadata, and asynchronous export artifacts enforce tenant,
   user, permission, expiry, and cleanup boundaries.
16. The rollout runbook exists at the specified path and records the actual
   migration, backfill, flag, restore, parity, and incident commands, with
   local versus authenticated staging/production evidence clearly separated.
17. Credits report controls reset pagination on filter changes, preserve the
   report watermark through paging/detail/export, and never download a partial
   or unauthorized export.
18. `transactionSourceType` and `contextSourceType` are validated against
   their separate registries, valid combinations filter correctly, and unknown
   values cannot become SQL wildcards.
19. Normal users receive `scope: "self"` with their own user predicate, while
   admin user/tenant reports return the correct scope and
   `distinctUserCount`; a crafted tenant or user ID cannot broaden access.
20. Over-refund, self-reversal, reversal-chain, duplicate-reversal, and
   cross-tenant refund fixtures are excluded from named totals, reported as
   integrity exceptions, and never alter the original transaction amount.
   The expected exception credit amount distinguishes a fully invalid row
   from only the excess portion of a partially valid refund.
21. Service-level source aliases that persist as `other` are normalized before
   report filtering, and the report never accepts a source value absent from
   the persisted database enum.
22. The Credits summary exposes non-zero integrity exceptions separately from
   charged/refunded/net totals and never presents excluded rows as production
   cost.
23. Self-service detail/export cannot be widened with a foreign tenant/user
   selector, while admin detail/export require explicit target scope,
   authorization, audit event, and matching watermark.

### 17.5 UI/browser tests

1. Mobile transaction cards show Series/work label, Skill/stage, amount, and
   net-readable status.
2. Desktop table shows the same context without layout regression.
3. Summary totals agree with the API fixture.
4. Loading, empty, error, unattributed, archived, and long-title states render
   correctly.
5. Audit detail reveals technical references only after the authorized action.
6. Thai and English labels are present and accessible.

Focused automated tests must run from the repository's actual workspace
commands. Browser verification is separate evidence from TypeScript/tests and
must be reported as such.

## 18. Observability and data-quality metrics

Emit bounded metrics/log fields for:

- `credit_context_created`
- `credit_context_reused`
- `credit_transaction_context_linked`
- `credit_transaction_context_unattributed`
- `credit_transaction_context_ambiguous`
- `credit_transaction_context_reconciliation_required`
- `credit_context_unused_after_provider_failure`
- `credit_context_orphan_detected`
- `credit_context_cross_tenant_rejected`
- `credit_context_idempotency_conflict`
- `credit_context_state_transition`
- `credit_context_audit_log_failure`
- `credit_context_integrity_exception`
- `credit_context_backfill_deferred_retryable`
- `credit_context_export_requested`
- `credit_context_export_failed`
- `credit_context_export_expired`
- `credit_transaction_missing_tenant_on_new_charge`
- `credit_context_report_query_ms`

Required dashboards or audit queries:

1. New Skill/LLM usage rows without a required context.
2. Context links with tenant/user mismatch.
3. Transactions with multiple primary links.
4. Orphaned context links.
5. Historical verified versus unattributed counts.
6. Gross/refund/net report parity against direct ledger queries.
7. Link-write failures and reconciliation age.
8. Integrity-exception count/credits by reason and original transaction.
9. Backfill deferred-retryable backlog and age by reason code.
10. Export requests, failures, expiry/cleanup failures, and artifact age by
    tenant-safe aggregate only.

The initial alert policy is:

1. Any cross-tenant link rejection, orphan link, or multiple-primary
   transaction is a critical integrity alert and must be zero after repair.
2. Any new `required` Skill/LLM debit that becomes unattributed is a high
   priority alert; the caller is disabled from strict rollout until fixed.
3. Historical unattributed/ambiguous rows are informational and tracked by
   percentage, not treated as runtime failures.
4. Any report parity difference between the direct ledger calculation and the
   context report is a high priority alert and blocks report rollout.
5. Link reconciliation older than the agreed operational SLA is alerted and
   included in the release handoff.
6. Any integrity exception on a new transaction is high priority and blocks
   report rollout for the affected scope until the existing financial policy
   verifies it; historical exceptions remain visible as data quality.
7. Any retryable backfill backlog exceeding the runbook SLA, or any expired
   export artifact not cleaned up, is operationally alerted without exposing
   tenant identifiers in the alert payload.

The rollout must add or update the operational runbook at
`docs/runbooks/credit-context-lineage-rollout.md` with backup, dry-run,
canary, pause/resume, restore, parity, feature-flag, and incident-response
commands. The runbook must identify which checks are local evidence and which
require authenticated staging/production access.

Logs must contain IDs needed for correlation but must not contain raw prompts,
tokens, credentials, signed URLs, or full provider payloads.

## 19. Definition of done

This feature is complete when:

1. The schema migration creates the polymorphic context registry, link table,
   backfill-run metadata, transaction-time tenant provenance, and reversal
   reference without changing balances or financial amounts.
2. New actual Skill/LLM debits, retries, refunds, and reconciliations are
   linked through the central credit boundary.
3. Vertical Drama Series/Job/Run work can be traced from a Credits row back to
   its authoritative source.
4. Fixed Skill revenue distribution remains correct and does not double-count
   user cost.
5. Historical rows are backfilled only when ownership and source identity are
   verified, with an explicit unattributed report for the remainder.
6. User history shows a human-readable Series/work title instead of a raw ID.
7. The usage report returns gross charged, refunded, and net actual credits by
   Series/work with stable pagination and no double-counting.
8. The detail and export reports use the same accounting query and expose
   named, tenant-safe results with explicit unattributed/ambiguous totals.
9. Tenant and user isolation tests pass, including malicious foreign IDs.
10. Migration idempotency, ledger parity, focused tests, type checks, and
   authenticated browser proof are recorded separately.
11. The implementation remains compatible with Feature 155 and can later link
    forecast/cost events to the same work contexts without introducing a second
    financial authority.

The report rollout is not complete until, for the same tenant/user/date
filters, the direct SQL ledger calculation and `credits.usageByContext`
calculation match exactly for charged, refunded, net, usage-count, and
refund-count totals, with any unattributed/ambiguous rows explicitly
reconciled.

## 20. Implementation decisions locked by this spec

1. Use a normalized `credit_contexts` registry plus
   `credit_transaction_contexts` link table.
2. Keep `credit_transactions` as the only actual credit ledger.
3. Use namespaced polymorphic references with typed server resolvers.
4. Store root context IDs for fast reports and parent links for traceability.
5. Store bounded display-name snapshots for rename/delete resilience.
6. Link refunds to original work and calculate net actual usage from immutable
   transaction rows.
7. Treat missing historical evidence as unattributed, never guessed.
8. Display human-readable labels by default and reserve technical IDs for
   authorized audit detail.
9. Keep provider USD, external-equivalent estimates, forecasting, and hard
   budget enforcement out of this feature's first release. A simple
   product-defined `1,000 credits = 1 USD` estimate may be shown on a Drama
   Series detail card for internal cost evaluation, but it must be labelled as
   an estimate and must never be presented as provider-reported USD or an
   invoice amount.
