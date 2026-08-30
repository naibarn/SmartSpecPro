# Section 03 — Central Billing and Caller Propagation

## Goal

Make actual Skill/LLM charges, retries, reservations, refunds, and queue-driven
work carry context through the existing central billing boundaries.

## Dependencies and owned files

Depends on sections 01–02. Own central billing files and only audited caller
hunks in `apps/web/server/**`:

- `apps/web/server/services/creditService.ts`
- `apps/web/server/services/skillRevenueBilling.ts`
- `apps/web/server/services/creditContextBilling.ts`
- `apps/web/server/services/verticalDramaLlmBilling.ts`
- related central/caller tests and queue envelope contracts

Do not broad-format or rewrite unrelated caller files.

## Required implementation

Extend central debit/add/model-debit/refund/reservation parameters with typed
context reference, transaction-time tenant, stage, attempt key, and bounded
run/job identity. Keep `CREDIT_CONTEXT_WRITE_ENABLED` and
`CREDIT_CONTEXT_STRICT_REQUIRED` disabled by default and independent from
balance mutation.

For a valid required context, resolve and link atomically with the ledger row
or emit a reconciliation record if the ledger commit succeeded but link write
failed. Invalid/foreign context fails before provider/debit work. A known
legacy work path without evidence remains explicitly unattributed and emits a
metric; no timestamp/description/Skill-slug guess is allowed.

Persist tenant on each new user-owned debit/refund/add. Preserve existing
source enum and normalize aliases. Admin/system compatibility deductions remain
outside production-cost reports unless explicitly linked with allow-listed
`work_adjustment` semantics.

Pass context through fixed Skill settlement. Link the user debit and owner/
revenue distribution rows to the same work context, while downstream reports
count only the user debit. Require Skill slug and preserve run identity.

Carry original transaction/reversal identity and context through reservation
create/draw/commit/expiry/refund, duplicate settlement keys, provider failure,
and retry. Refund validation rejects self-reversal, reversal chains, duplicate
reversal, cross-tenant/user, and over-refund; valid refunds are positive rows
and do not mutate the original.

Ensure Redis cache hits repair compatible missing links without a second ledger
row. Concurrent same-idempotency requests converge; conflicting context is
audited/rejected. Version queue/Worker billing envelopes and re-authorize the
receiving process before provider/debit work.

Update audited Vertical Drama Series/Job/Run/episode/stage, async Skill, LLM,
media, public API, worker, browser, library/OCR, translation, voice, MCP, and
scheduler callers where context is provable. Leave truly contextless paths
best-effort/unattributed with classification metadata.

## TDD-first tests

Cover normal LLM/Vertical Drama debit, Skill settlement, reservation lifecycle,
valid/invalid refund, retries/attempt keys, idempotency/cache repair/conflict,
provider-success/ledger-failure reconciliation, queue envelope authorization,
admin exclusion/work adjustment, and legacy unattributed behavior. Add caller
tests for each high-risk wrapper rather than only testing the central helper.

## Completion evidence

Run focused credit/reservation/Skill/LLM tests and inspect the audited caller
inventory. The central functions remain the only financial writers. Record any
caller that lacks a provable context as explicit unattributed rather than
claiming full historical attribution.

## Implemented locally

Central debit/add/refund/reservation and Skill settlement paths now carry
tenant/context/reversal fields, infer only structured Series metadata, repair
Redis idempotency cache hits, and attach Skill refunds/revenue links. Caller
audit reports 212 billing/ledger call entries: 122 context-aware, 80 explicit
legacy unattributed, 10 scoped central-writer entries, zero ledger bypasses,
and zero unclassified calls.
