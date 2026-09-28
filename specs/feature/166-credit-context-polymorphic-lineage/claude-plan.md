# Feature 166 Implementation Plan

## Outcome and implementation order

Implement a tenant-safe lineage layer around the existing credit ledger so a
credit row can be traced to a human-readable Series/Job/Run/Task/work label and
aggregated into an actual platform-credit cost report. The work is ordered:

1. Database/schema foundation and shared type contracts.
2. Resolver, ownership validation, link writer, lifecycle reconciliation, and
   audit/metrics.
3. Central billing integration and caller propagation.
4. Historical backfill, audit, and caller inventory tools.
5. Shared accounting/report service and tRPC APIs.
6. Credits page integration.
7. Test, observability, runbook, and cross-section verification.

The implementation is additive. It must not change an existing balance,
transaction amount, provider contract, or existing user history behavior when
the feature flags are disabled.

## 1. Database and type foundation

### Files

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/relations.ts` if relation declarations are used by the
  repository for the new tables
- `apps/web/drizzle/0264_credit_context_polymorphic_lineage.sql`
- `apps/web/drizzle/meta/_journal.json`
- `apps/web/shared/creditContextContracts.ts`
- `apps/web/server/services/creditContextRegistry.ts`

### Schema design

Add `credit_contexts` with a native UUID primary key and fields for tenant ID,
owner user ID, context type, namespaced source type/key, optional parent/root
context UUIDs, bounded live label and label snapshot, resolver version,
resolution state, lifecycle state/timestamps, and created/updated timestamps.
Add checks for bounded strings, self-root consistency, and valid enum-like
states. Use a unique tenant-scoped source identity and indexes for tenant/root,
tenant/type, source identity, and lifecycle state.

Add `credit_transaction_contexts` with UUID primary key, integer transaction FK,
context UUID FK, link role (`primary`, `parent`, `root`, `execution`,
`conversation`, or `explanatory`), provenance, bounded confidence/reason,
snapshot fields, and created timestamp. Add a partial unique index allowing at
most one primary link per transaction, plus transaction/context and tenant-safe
lookup indexes. Financial transaction deletion must not silently orphan a link.

Add `credit_context_backfill_runs` with UUID run ID, mode/status, tenant/user
scope, immutable scan watermark, cursor, lease owner/expiry, batch size,
counters, disposition summary, parity evidence, operator, and timestamps.
This table is operational metadata and is never joined as a financial source.

Add nullable `tenantId` and `reversalOfTransactionId` to
`credit_transactions`. `tenantId` is required by the new writer for
user-owned charges but remains nullable for legacy/system rows. The reversal FK
is self-referencing and must not cascade-delete financial history.

The SQL migration must be the next journal entry after `0263_free_plan_assignment`,
use the repository statement-breakpoint format, verify incompatible existing
objects instead of silently accepting them, enable UUID generation with
`gen_random_uuid()`, and create/validate all required indexes. It must not scan
the ledger, update balances, update amounts, or perform backfill.

### Shared contract and registry

`creditContextContracts.ts` defines the context source union, resolution and
attribution states, link roles/provenance, accounting source types, bounded
limits, report filter/response types, typed errors, and a versioned
`CreditContextRef` input. The contract distinguishes `transactionSourceType`
from `contextSourceType`; service aliases normalize to persisted `other`.

`creditContextRegistry.ts` owns the allowlist and resolver metadata for Series,
Vertical Drama job/run/task, conversation, skill run, media task, API job, and
generic work. Every registry entry declares how to resolve the live label,
parent, root, tenant, user ownership, required ancestry, and whether a
temporary source-unavailable result is retryable rather than archived.

### Tests first

Add schema shape/type tests, migration file/journal tests, enum/normalization
tests, registry completeness tests, and a DB integration fixture for UUID/FK,
primary-link uniqueness, cross-tenant rejection, and additive ledger parity.

## 2. Context resolution, linking, lifecycle, and audit

### Files

- `apps/web/server/services/creditContextResolver.ts`
- `apps/web/server/services/creditContextWriter.ts`
- `apps/web/server/services/creditContextLifecycle.ts`
- `apps/web/server/services/creditContextAudit.ts`
- `apps/web/server/services/__tests__/creditContextResolver.test.ts`
- `apps/web/server/services/__tests__/creditContextWriter.test.ts`
- `apps/web/server/services/__tests__/creditContextLifecycle.test.ts`

### Resolver behavior

Expose a resolver that accepts a server-side context reference and authenticated
user/tenant scope. It canonicalizes/namespaces IDs, rejects unsafe or
oversized values, loads the authoritative source, verifies ownership and
tenant, resolves parent/root recursively with a bounded depth, and returns a
bounded label/snapshot. Client-supplied display names are never authoritative.
Missing source, ambiguous source, temporary lookup failure, archived source,
and invalid ownership must be different outcomes. A temporary database/source
unavailability must not archive a context.

Root contexts point to themselves; child contexts point to a same-tenant root.
Cycle detection and maximum-depth checks happen before persistence. The first
safe snapshot is retained for historical display when a source is renamed or
deleted. Reconciliation is idempotent and changes context state/labels only,
never financial rows or links.

### Link writer

Expose an atomic writer that either creates/reuses a context and links one
transaction or returns a structured unattributed/reconciliation result. It
validates transaction user and tenant, source ownership, primary-link
uniqueness, compatible idempotency identity, and root/parent consistency in one
database transaction. It must support cache-hit repair when a ledger row exists
but its link is missing, and reject a cache-hit context conflict. It must not
create duplicate amount-bearing links under concurrent requests.

The writer records provenance (`live_resolved`, `historical_verified`,
`manual_review`, or explicit unresolved reason), emits bounded metrics, and
uses the existing `auditLogger.log` boundary. Audit failure is best-effort but
increments `credit_context_audit_log_failure`.

### Lifecycle and correction

Source archive/delete handlers call lifecycle reconciliation with a tri-state
lookup result: resolved, confirmed missing, or temporarily unavailable. Confirmed
missing transitions a context to archived while preserving its first safe
snapshot. A privileged manual correction path can replace an ambiguous or
unresolved link only after validating ownership, reason, operator, and audit
record; it never rewrites amount or balance.

### Tests first

Cover namespaced numeric/UUID/string IDs, authoritative labels, ownership,
cycles, depth, snapshots, state transitions, temporary failure, cache repair,
conflict, concurrent primary uniqueness, audit failure, archive/delete, and
manual correction.

## 3. Central billing and caller propagation

### Files

- `apps/web/server/services/creditService.ts`
- `apps/web/server/services/skillRevenueBilling.ts`
- `apps/web/server/services/creditContextBilling.ts`
- `apps/web/server/services/verticalDramaLlmBilling.ts`
- audited billing callers under `apps/web/server/**`
- `apps/web/server/__tests__/creditContextBilling.test.ts`
- `apps/web/server/__tests__/creditReservation.test.ts` updates

### Central contract

Extend debit, add, refund, model debit, reservation billing context, and fixed
Skill settlement parameters with an optional typed context reference, stage,
attempt key, and transaction-time tenant. Required context mode is controlled
by `CREDIT_CONTEXT_STRICT_REQUIRED`; write/report flags are independent and
must never affect balance mutation.

The central writer inserts the ledger row and primary context link atomically
where possible. If a provider succeeds but link persistence fails, the ledger
charge remains authoritative and a reconciliation record/metric is emitted; no
second charge is attempted. A required invalid/foreign reference fails before
provider/debit work. An audited legacy call without known context remains
unattributed, with no timestamp or text guessing.

Persist transaction tenant on every new user-owned debit/refund/add path. Keep
admin/system rows outside production-cost totals unless they carry an explicit
allow-listed `work_adjustment` link. Preserve existing source enum values and
normalize service aliases before insert/filter.

### Skill and reservation rules

Pass context through `skillRevenueBilling` so the user debit and revenue
distribution rows share lineage but reports count only the user debit. Refunds
must reference the original transaction, validate same user/tenant and amount,
reject self/reversal-chain/duplicate/cross-tenant/over-refund cases, and expose
integrity exceptions without altering the original row. Reservation create,
draw, commit, expiry, duplicate draw, provider failure, and refund preserve
the same context, original transaction, run ID, and attempt identity.

Idempotency cache and database unique-key paths converge to one transaction and
one compatible primary link. A conflicting concurrent context is rejected and
audited. Queue/Worker envelopes carry a versioned bounded billing context and
the receiving process re-authorizes tenant/user/source before provider or
debit work.

### Caller coverage

Update all audited production callers with context available, prioritizing
Vertical Drama Series/Job/Run/episode/stage paths, async Skill jobs, LLM route
helpers, media tasks, public API jobs, worker runtime, browser automation,
library/OCR, translation, voice, MCP, and scheduler paths. Calls with no
provable work remain explicitly unattributed. Add tests proving direct calls,
wrappers, retries, refunds, and fixed Skill rows use central billing.

## 4. Backfill, audit, and static caller guard

### Files

- `apps/web/scripts/backfill-credit-context-lineage.ts`
- `apps/web/scripts/audit-credit-context-lineage.ts`
- `apps/web/scripts/audit-credit-context-callers.ts`
- `apps/web/scripts/__tests__/creditContextBackfill.test.ts`
- `apps/web/scripts/__tests__/creditContextCallerAudit.test.ts`
- `docs/runbooks/credit-context-lineage-rollout.md`

### Backfill

Build a dry-run-first, bounded, resumable command with `--dry-run` default,
`--apply`, `--batch-size`, `--start-id`, `--run-id`, `--pause-after-batch`,
`--tenant-id`, and `--user-id`. It captures an immutable scan-through
transaction ID, persists cursor/lease/counters after each batch, refuses a
second active run for the same scope, and resumes paused/stale runs without
duplicating links. Dispositions distinguish permanent unattributed/ambiguous
rows from retryable source-unavailable/deferred rows.

Only structured metadata, existing Skill settlement relationships, durable
run/task identities, and verified ownership may create a link. Timestamp,
description, Skill slug alone, nearest job, or unverified trace text may never
assign a context. Malformed values are counted and skipped. The tool outputs
before/after ledger counts and sums, balance parity, link counts, ownership
rejections, duplicate counts, and unattributed/ambiguous totals. It does not
run during migration.

The read-only audit tool reports orphan links, multiple primaries, mismatched
tenant/user, state/resolver drift, integrity exceptions, and parity results
without mutating data. The static caller guard parses TypeScript AST where
available, ignores tests/comments, detects direct calls/wrappers/aliases,
requires classification metadata, and emits stable JSON containing caller,
symbol, source provenance, context availability, strictness, and schema/commit
version. CI fails only for unclassified production callers or central-writer
bypasses.

### Runbook

Document backup/snapshot, migration preflight, index validation, dry-run,
canary, pause/resume, restore rehearsal, parity, feature flags, alert response,
and local-versus-authenticated staging/production evidence. The runbook must
never tell local implementation to run production migration/backfill.

## 5. Accounting reports and API

### Files

- `apps/web/server/services/creditContextReports.ts`
- `apps/web/server/routers/credits.ts`
- `apps/web/server/services/__tests__/creditContextReports.test.ts`
- `apps/web/server/routers/__tests__/creditsContext.test.ts`

### Shared accounting query

Create one service that resolves a bounded UTC date range, captures/accepts an
`asOfTransactionId` watermark, applies authorized tenant/user predicates before
joining or resolving labels, and computes both page rows and global totals.
Use distinct transaction IDs and primary-link attribution so root/parent and
Skill revenue links cannot multiply amounts. Include only negative usage,
positive valid reversals, and explicitly allow-listed work adjustments.
Separate named, unattributed, ambiguous, and integrity-exception totals. Do
not include admin/system compatibility adjustments in production cost.

The service exposes summary grouping by root/primary work with deterministic
ordering and nested by-work, persisted transaction source, context source,
Skill, model/provider, and stage. It also exposes detail transactions in stable
`createdAt DESC, id DESC` order, completeness state, retry/attempt metadata
when authorized, and the same totals used by export. All labels use live
authoritative values or safe snapshots. Raw IDs are machine navigation keys;
technical references require existing technical-audit permission.

### tRPC procedures

Keep existing `credits.history` and admin history response compatibility while
adding safe context presentation. Add protected `credits.usageByContext`,
`credits.contextUsageDetail`, and `credits.exportUsageByContext`, plus explicit
`credits.adminUsageByContext`, `credits.adminContextUsageDetail`, and
`credits.adminExportUsageByContext`. Self procedures cannot accept tenant/user
selectors; admin procedures require explicit target tenant, optional target
user, existing admin authorization, target predicates, sanitized audit event,
and returned scope/watermark.

Validate context type/source and persisted transaction source separately.
Reject foreign/unauthorized contexts, invalid date ranges, missing tenant,
export range overflow, and unavailable dependencies with stable typed errors.
Interactive exports require an explicit bounded range; long exports may use an
authorized bounded async artifact containing only query spec and watermark,
with tenant/user checks, expiry, cleanup, and download-time permission.

### Tests first

Use fixtures with two tenants/users, multiple root/child links, fixed Skill
revenue rows, valid/invalid refunds, admin adjustments, retries, null legacy
tenant, ambiguous/unattributed rows, model/stage metadata, and post-watermark
inserts. Assert exact gross/refund/net/count parity, pagination stability,
filters, authorization, audit, export equivalence, and no raw ID/title leak.

## 6. Credits UI

### Files

- `apps/web/client/src/pages/Credits.tsx`
- `apps/web/client/src/locales/en/*.json`
- `apps/web/client/src/locales/th/*.json`
- focused Credits page tests near the existing page test location

Extend the current history query/row mapper with the safe context object. Show
human-readable primary work label, root label, work type, stage, Skill, and
actual amount/net status. Preserve existing source filter and pagination, reset
pagination when filters/date range change, keep watermark for paging/detail/
export, and show data-quality totals when named row sums are incomplete.
Provide a summary card for charged, refunded, net actual, unattributed,
ambiguous, and integrity-exception credits. Detail is a guarded user action;
technical references remain hidden unless the existing permission allows them.

## UI/UX Contract

### Target User / JTBD

- Role: authenticated credit user; tenant-authorized admin for explicit admin
  surfaces.
- Goal: understand what work consumed credits and verify a Series/job total.
- Entry point: `/credits`, existing history and report controls.
- Success: a user can identify work by title, filter a bounded period, inspect
  net actual credits, and understand incomplete attribution without seeing raw
  internal IDs.

### Existing Pattern Reference

- Searched with targeted `rg` across `apps/web/client/src/pages` and
  `components` for Credits history, stats, table/card, filters, loading/error,
  and responsive patterns; SocratiCode was unavailable.
- Found: `apps/web/client/src/pages/Credits.tsx` existing balance/history/source
  filter/pagination layout and its current tests/configuration.
- Decision: reuse the existing page structure, query patterns, card/table
  breakpoints, metadata allow-list, and localization conventions. Divergence is
  limited to adding context summary/detail surfaces required by the report.

### Surface inventory

| Surface | File/route | Change |
|---|---|---|
| User Credits | `Credits.tsx`, `/credits` | Context labels, summary, filters, detail/export |
| Transaction card/table | `Credits.tsx` components | Work title/type/stage/net state |
| Admin report | existing admin credit route/surface | Explicit tenant/user report controls where present |
| Localization | `client/src/locales/{en,th}` | Labels and error/quality copy |

### Component map

| Component | Owner | Owns | Consumes |
|---|---|---|---|
| Credits page | `Credits.tsx` | query state, filters, watermark, summary | tRPC report/history |
| Transaction row/card | existing page components | readable work presentation | safe history context |
| Usage summary | Credits page/local component | gross/refund/net/data-quality totals | usage report totals |
| Detail dialog/panel | Credits page/local component | authorized selected context detail | detail query |

### State matrix

| State | Expected UI | Verification |
|---|---|---|
| loading | skeleton/disabled report controls | Vitest + browser |
| empty | clear no-transactions/no-named-work copy | Vitest + browser |
| error | localized safe retry message, no IDs/provider errors | Vitest + browser |
| success | labels, totals, stable pagination | Vitest + browser |
| partial/unattributed | explicit data-quality notice and fallback copy | Vitest + browser |
| archived | snapshot label with archived indicator | Vitest + browser |
| disabled | export/detail disabled while unauthorized/loading | Vitest |
| hover/focus/selected | visible row selection and keyboard focus | browser/a11y |

### Responsive matrix

| Viewport | Expected behavior |
|---|---|
| mobile 390x844 | cards stack; title wraps; summary scrolls without horizontal page overflow |
| tablet 768x1024 | compact table/card hybrid; filters wrap |
| laptop 1024x768 | full controls and bounded table columns |
| desktop 1440x900 | table and summary visible with readable labels |
| small-mobile 360x800 | dense labels wrap/truncate safely; no clipped action |
| wide-desktop 1280x800 | report columns remain bounded and aligned |

### Accessibility acceptance

Keyboard can reach filters, rows, detail, and export in logical order; focus is
visible; labels and status text are semantic and localized; amounts use text
not color alone; contrast remains accessible; loading/error changes are
announced where appropriate; no motion is required and reduced-motion users
receive the same information.

### Copy contract

Tone is plain, calm, and audit-oriented. Thai is the default product language
with English fallback. Required labels include `เรื่อง`, `งาน`, `ขั้นตอน`,
`ใช้ไป`, `คืนเครดิต`, `สุทธิ`, `ยังระบุงานไม่ได้`, `ข้อมูลกำกวม`, and
`รายการผิดปกติ`; English equivalents are Story/Work/Stage/Charged/Refunded/
Net/Unattributed/Ambiguous/Integrity exception. Errors say the report is
temporarily unavailable or the selection is not authorized, never raw IDs or
provider details.

### Browser evidence required

Follow `skills/orchestra/references/ui-browser-verification.md`: authenticated
fixtures must capture mobile 390x844, tablet 768x1024, and desktop 1440x900
history/report/detail states, loading/empty/error/unattributed states, filter
reset, stable paging watermark, and export/detail authorization. Browser proof
is reported separately from Vitest/typecheck.

## 7. Verification, observability, and rollout gates

Add focused tests for every section before implementation, then run the
workspace test command for changed suites, migration/schema tests, caller guard,
and typecheck. Run a full workspace suite where resource limits allow; record
unrelated baseline failures separately. Run static audit and read-only lineage
audit with JSON evidence. Capture query plans against representative fixtures
before enabling reports. No production migration, backfill, deployment, or
provider replay is performed locally.

Emit the locked metrics for context create/reuse/link/unattributed/ambiguous,
reconciliation, orphan/cross-tenant/idempotency/state/audit failure,
backfill-deferred, export, missing tenant, integrity exception, and report
latency. Add safe aggregate audit queries/dashboard guidance to the runbook.

Feature flags default to false: `CREDIT_CONTEXT_WRITE_ENABLED`,
`CREDIT_CONTEXT_REPORT_ENABLED`, `CREDIT_CONTEXT_STRICT_REQUIRED`; configure
`CREDIT_CONTEXT_MAX_EXPORT_DAYS` (default 366),
`CREDIT_CONTEXT_MAX_INTERACTIVE_DAYS`, and
`CREDIT_CONTEXT_REPORT_P95_BUDGET_MS` (default 500 ms) alongside bounded
interactive range, export, and query latency limits. Enable in order only after
schema/index validation, central caller coverage, canary/backfill parity,
tenant isolation, and authenticated browser proof.

## Cross-section interfaces and acceptance

- Section 1 exports schema tables, contract unions, registry metadata, and
  persisted source normalization used by all later sections.
- Section 2 exports `resolveCreditContext`, `linkCreditTransactionContext`,
  lifecycle reconciliation, and typed audit/metric helpers; it never mutates
  financial amounts.
- Section 3 calls section 2 from every central debit/refund/reservation path and
  exports context-aware billing parameters for callers.
- Section 4 reads the same resolver/writer and ledger predicates; it does not
  introduce alternate attribution or ledger writes.
- Section 5 consumes the same tables/accounting predicate for history, summary,
  detail, and export; section 6 consumes only safe API response types.
- All sections must preserve tenant-first authorization, deterministic IDs/
  ordering, and the single-ledger rule.

## Definition of done

The feature is complete only when the schema migration is validated, all
newly-audited billing paths preserve context, historical evidence is verified
or explicitly unattributed, reports and exports have exact direct-ledger
parity, user/admin isolation tests pass, Credits shows readable work labels,
static/backfill/audit evidence and runbook are present, and local/browser/
staging/production evidence is clearly separated.
