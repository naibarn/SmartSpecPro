# Section 02 — Resolver, Link Writer, Lifecycle, and Audit

## Goal

Resolve authoritative work sources safely and link ledger transactions without
guessing, leaking tenant data, or mutating financial values.

## Dependencies and owned files

Depends on section 01 contracts/tables. Own:

- `apps/web/server/services/creditContextResolver.ts`
- `apps/web/server/services/creditContextWriter.ts`
- `apps/web/server/services/creditContextLifecycle.ts`
- `apps/web/server/services/creditContextAudit.ts`
- focused service tests under `apps/web/server/services/__tests__/`

## Required implementation

Implement `resolveCreditContext(ref, scope, options)` to canonicalize a
namespaced source key, reject unsafe/oversized values, call the registry's
authoritative resolver, verify tenant/user ownership, resolve bounded parent and
root ancestry, and return a bounded label/snapshot plus resolution state. Never
trust client display names. Distinguish missing, ambiguous, archived,
temporarily unavailable, invalid, and unauthorized results. Temporary lookup
failure is retryable and must not archive a context.

Root contexts self-reference their root ID. Child parent/root links must be
same-tenant, cycle-free, and within the configured maximum depth. Preserve the
first safe snapshot when live source names change or a source is confirmed
deleted. Map internal states consistently to `linked`, `partial`,
`unattributed`, and `ambiguous` presentation states.

Implement `linkCreditTransactionContext(input, tx?)` as the single link writer.
It validates ledger user/tenant, source ownership, root/parent consistency,
primary uniqueness, and idempotency compatibility in one transaction. It may
create/reuse a context and primary/explanatory links. A Redis/database cache
hit with a missing compatible link repairs the link; a conflicting context is
rejected and audited. Concurrent compatible calls converge to one primary
link. It returns explicit attribution/reconciliation status and never changes
ledger amount/balance.

Implement lifecycle reconciliation with tri-state source lookup. Confirmed
missing transitions the context to archived and preserves the first safe
snapshot; transient unavailable leaves state unchanged. Implement privileged
manual correction only for ambiguous/unresolved links after tenant ownership,
operator permission, reason, and audit validation.

Use existing `auditLogger.log`, bounded IDs/reason metadata, and metric names
from the spec. Audit failure is best-effort and increments
`credit_context_audit_log_failure`; no raw prompt/provider payloads or signed
URLs are logged.

## TDD-first tests

- Numeric/UUID/string key namespacing and unsafe/oversized input.
- Authoritative title versus client hint; rename/delete snapshot behavior.
- Parent/root resolution, cycles, depth, cross-tenant and cross-user rejection.
- All resolution/lifecycle state transitions including temporary failure.
- Idempotent create/reuse, missing-link cache repair, conflict rejection, and
  concurrent one-primary behavior.
- Audit success/failure and bounded metric emission.
- Archive/delete idempotency and manual correction authorization/audit.

## Completion evidence

Focused tests pass with mocked source resolvers and optional DB integration.
Exported names used by section 03 must include resolver, link writer,
lifecycle reconciliation, presentation mapping, typed errors, and safe audit /
metric helpers. No caller may resolve a title directly from a client-supplied
ID or use timestamp/description inference.

## Implemented locally

Added the registry, resolver, writer, lifecycle reconciliation, safe snapshots,
one-primary enforcement, cycle/depth checks, and bounded audit/metric helpers.
Foundation and contract tests pass; DB concurrency and authenticated source
replay remain staging/DB-integration evidence.
