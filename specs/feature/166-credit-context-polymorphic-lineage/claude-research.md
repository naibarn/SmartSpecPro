# Feature 166 Research

## Research decision

- Codebase research: required. This is an existing git repository with a large
  TypeScript/React application and existing credit, skill, LLM, queue, and
  migration code.
- SocratiCode: attempted as the repository's preferred discovery layer, but no
  `codebase_status`/SocratiCode MCP tool is available in this runtime. The
  research therefore uses targeted `rg`, line-range reads, migration metadata,
  and focused source inspection. This fallback must remain explicit in the
  implementation handoff.
- Web research: not required for the implementation decision. The locked spec
  selects normalized PostgreSQL tables, Drizzle, tRPC, Vitest, and the existing
  repository conventions; no external API contract is being introduced.
- Testing: existing workspace tests use Vitest. Run focused tests from
  `apps/web` with `npm test -- <paths/options>` and use
  `npm run typecheck` for TypeScript. Browser evidence is separate and uses the
  repository Playwright configuration.

## Repository architecture and relevant contracts

### Financial ledger

`apps/web/drizzle/schema.ts` defines `creditTransactions` as the sole existing
credit ledger. It currently stores integer amounts, transaction type,
description, JSON metadata, balance-after, idempotency key, trace ID,
conversation ID, skill slug, and the persisted `credit_source_type` enum. The
current database journal already contains migration `0263_free_plan_assignment`,
so Feature 166 must use `0264_credit_context_polymorphic_lineage.sql`.

The ledger is intentionally user-owned and has no current transaction-time
tenant column or reversal foreign key. New schema additions must be additive and
must not recalculate balances or rewrite amounts.

### Central billing boundary

`apps/web/server/services/creditService.ts` is the central boundary for
`deductCredits`, `addCredits`, `refundCredits`, reservations, model-based LLM
deductions, indexing, and RAG charges. It already has Redis idempotency,
database unique-key fallback, row-safe balance mutation, budget hooks, trace ID
clamping, and Skill routing into `skillRevenueBilling.ts`.

The implementation must extend these boundaries rather than creating a second
ledger writer. Skill fixed-price settlement is special: it can create the user
debit and owner/revenue rows together. Reports must count only the user debit as
production cost and link all related rows to the same work context without
double-counting.

Reservation behavior currently debits the reserved amount up front, records
draws in Redis, and refunds the unused amount. Context and original-transaction
identity must survive this lifecycle, including expiry, duplicate draw keys,
provider failure, and refund.

### Existing callers

Targeted inventory found approximately 89 server files with billing symbols,
including chat/LLM routes, Responses, MCP, public APIs, media and video
projects, browser automation, translation, voice, OCR/library, Vertical Drama
story/episode/media helpers, marketplace review, worker/runtime services, and
reservations. Several wrappers and comments make text grep insufficient; the
implementation includes a static AST inventory/audit script and a caller
registry so every production debit/refund path is classified.

### Existing reporting and UI

`apps/web/server/routers/credits.ts` exposes protected user history/stats and
admin history/adjustment procedures. History currently joins conversation and
skill names, sanitizes metadata through an allow-list, and returns source type
and trace fields. Admin procedures use the existing `adminProcedure` boundary.

`apps/web/client/src/pages/Credits.tsx` is the current Credits page. It already
has balance, transaction history, source filtering, pagination, stats, and OCR
summary queries. Context labels and usage summaries should be added within this
surface, preserving mobile cards and desktop table behavior.

`apps/web/shared/creditTransactionSource.ts` is the existing persisted source
enum/type presentation contract. Service-only aliases such as
`vision_analysis`, `embedding_generation`, and `reference_resolution` are
currently normalized to the persisted `other` value; report filters must use
the persisted enum and keep transaction source type separate from context source
type.

### Data/model conventions

Tenant IDs are `varchar(36)` in `tenants.id`; new context IDs and all context
self/FK links must instead consistently use PostgreSQL native `uuid` with
`gen_random_uuid()` as required by the locked spec. Existing migrations use
idempotent DDL and `--> statement-breakpoint`; the new migration must follow
that format, verify incompatible pre-existing objects, and avoid scanning the
ledger during deployment.

Audit events use the existing `auditLogger.log` boundary. New audit metadata
must be bounded and sanitized. Audit failure follows the repository's
best-effort behavior but must produce an operational metric.

### Testing and verification

- Unit/service/router tests live beside source files or under `__tests__` and
  use Vitest.
- DB integration tests are opt-in through `RUN_DB_INTEGRATION_TESTS=true` and a
  test `DATABASE_URL`; local schema/migration tests must not imply a production
  migration was run.
- `apps/web/vitest.config.ts` and `apps/web/playwright.config.ts` are the
  authoritative test/browser configuration.
- Full `apps/web` typecheck may be memory-intensive, so focused TypeScript
  checks and baseline-wide failures must be reported separately.
- Browser verification needs an authenticated seeded environment; it cannot be
  claimed from unit tests alone.

## Implementation implications

1. Build a small context contract/resolver module first, with an explicit
   registry for source types, namespaced IDs, root/parent policy, bounded
   snapshots, and resolution states.
2. Add Drizzle schema and migration before service code. Use a transaction link
   writer that validates user/tenant/source ownership and primary-link
   uniqueness.
3. Wrap the existing central ledger writer so every new row can attach a
   context or be explicitly recorded as unattributed. Do not mechanically
   guess context from timestamps, descriptions, or Skill slug.
4. Add one shared accounting/report query service used by self/admin summary,
   detail, and export endpoints. This prevents CSV totals from diverging from
   interactive totals.
5. Add the historical lineage backfill and audit tools as dry-run-first,
   resumable maintenance commands; never run them as part of deployment.
6. Add the caller inventory and CI guard after central contracts exist so
   existing wrappers can be classified without creating false positives for
   tests/comments.
7. Add Credits UI only after API contracts are stable. Reuse existing Credits
   filters/table/card patterns and require browser evidence for all responsive
   states.

## Risks discovered before planning

- The large dirty worktree contains unrelated changes and deletions. Only
  Feature 166-owned paths may be staged or committed.
- The migration sequence changed from the initial spec assumption; this was
  corrected in `spec.md` before planning.
- Existing admin deductions use a generic central debit with admin metadata.
  They must remain excluded from production-cost totals unless an explicit
  allow-listed `work_adjustment` contract is present.
- Skill settlement returns a user transaction identity separately from revenue
  distribution rows; report joins must use a primary user-debit rule.
- Redis can return a cached idempotent result before a link exists. A cache hit
  must repair a missing compatible link, but reject conflicting context rather
  than attaching a different work.
- Historical rows lack reliable tenant/context provenance. Unattributed and
  ambiguous outcomes are expected data-quality results, not reasons to invent
  ownership.
