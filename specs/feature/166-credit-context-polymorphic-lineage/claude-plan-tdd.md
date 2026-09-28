# Feature 166 TDD Plan

Tests are written before each implementation section. Existing repository
conventions are Vitest for TypeScript, focused tests from `apps/web`, optional
DB integration through `RUN_DB_INTEGRATION_TESTS=true`, and Playwright for
authenticated browser evidence.

## 1. Database and type foundation

- Schema exports contain all three context tables and new ledger columns.
- Migration is 0264, journal ordering is valid, SQL uses native UUID consistently,
  defaults/checks/indexes/FKs match Drizzle declarations, and migration is
  additive/idempotent for compatible objects.
- Context source and persisted transaction source unions reject unknown values;
  aliases normalize to `other`.
- DB fixture proves tenant-scoped source uniqueness, one primary link,
  cross-tenant/cross-user FK rejection, and unchanged ledger amount/balance.

## 2. Context resolution, linking, lifecycle, and audit

- Resolver returns authoritative Series/Job/Run labels and root/parent identity.
- Numeric, UUID, and string keys are namespaced without collision; unsafe,
  oversized, missing, ambiguous, archived, and temporarily unavailable sources
  return distinct outcomes.
- Client labels cannot override live labels; snapshots survive rename/delete.
- Root/parent cycle, depth, tenant, user, and primary-link constraints fail
  closed.
- Link writer is idempotent, repairs a missing link on compatible cache hit,
  rejects conflicting cache/concurrent contexts, and emits safe metrics/audit.
- Lifecycle archive/delete is idempotent, preserves financial links/snapshot,
  and does not archive on transient failure; manual correction is authorized and
  audited.

## 3. Central billing and caller propagation

- Normal LLM debit creates one ledger row and one primary context link.
- Vertical Drama context carries Series/Job/Run/stage/attempt.
- Skill fixed settlement links user/revenue rows but report identity remains one
  user debit; missing Skill slug fails.
- Reservation create/draw/commit/expiry/refund and provider failure preserve
  context and original transaction.
- Valid refund reduces net; over-refund, self/reversal-chain, duplicate, and
  cross-tenant cases become integrity exceptions without mutating original.
- Idempotency retry/cache repair converges; conflicting contexts reject; new
  attempt keys produce independent rows; provider success/ledger failure is
  reconcilable.
- Queue envelope version/authorization is checked before provider/debit.
- Admin/system compatibility rows are excluded unless allow-listed work
  adjustment; legacy context-less paths are explicit unattributed.
- Caller inventory covers direct calls, aliases, wrappers, comments/tests
  exclusion, and fails unclassified production bypasses.

## 4. Backfill, audit, and static guard

- Dry-run is default and reports deterministic run ID, scan watermark, cursor,
  counters, and disposition codes.
- Apply is bounded, leased, resumable, idempotent, and rejects a second active
  run for the same scope.
- Only structured verified evidence creates links; timestamp/description/slug/
  nearest-job guesses are skipped and counted.
- Malformed/missing/ownership-conflict rows do not abort the batch.
- Audit tool is read-only and detects orphan/multiple-primary/mismatch/state/
  integrity/parity issues.
- Runbook includes backup, canary, pause/resume, restore, parity, flags, and
  local-vs-authenticated evidence.

## 5. Accounting reports and API

- Fixture totals prove usage/refund/adjustment accounting and exclusion of
  invalid/admin/revenue rows.
- Parent/root links and revenue distribution do not double-count.
- Unattributed and ambiguous buckets stay separate; page totals differ from
  global totals only as documented.
- Date boundaries, filters, deterministic ordering, limit/offset, and watermark
  stability work after newer transactions are inserted.
- Self scope cannot be widened; admin scope requires explicit tenant and audit,
  applies target predicates before labels, and returns correct scope/count.
- Detail uses same totals and stable order; foreign context is rejected.
- Export uses same service/totals, bounded explicit range, safe labels, no raw
  IDs by default, and secure expiry/download behavior for async overflow.
- Model/stage/source breakdowns are deterministic and authorization-safe.

## 6. Credits UI

- Mock tRPC state by selection/filter and verify readable context labels, stage,
  amount, and net status on mobile cards and desktop table.
- Summary shows charged/refunded/net/unattributed/ambiguous/integrity totals and
  never treats visible page rows as global totals.
- Loading, empty, error, partial, archived, disabled, hover, focus, and long
  title states are covered.
- Filter changes reset pagination; watermark persists through paging/detail/
  export; unauthorized detail/export cannot be triggered.
- Thai/English localization keys and accessible semantics are covered.
- Playwright evidence is required at 390x844, 768x1024, and 1440x900; browser
  evidence is recorded separately from unit/typecheck proof.

## 7. Verification and rollout

- Focused suite, migration checks, caller audit JSON, lineage audit JSON, and
  typecheck commands are documented and reproducible.
- Direct-ledger parity checks match report totals for charged/refund/net/count.
- Metrics are bounded and redacted; audit logger failures increment a metric.
- Feature flags default off and report rollout cannot pass missing-index,
  cross-tenant, parity, integrity, or query-budget gates.
