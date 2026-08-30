# Synthesized Specification — Feature 166

## Objective

Make every new paid Skill/LLM operation traceable from the immutable
`credit_transactions` ledger to the Series, Job, Run, Task, conversation, or
other authoritative work that caused it. Users must see a human-readable work
title in Credits, while authorized reports must calculate gross charged,
refund, net actual, and data-quality totals per work without double-counting.

## Locked architecture

- `credit_transactions` remains the only financial authority.
- Add normalized `credit_contexts` as a tenant-scoped polymorphic registry.
- Add `credit_transaction_contexts` as a many-to-many explanatory link table,
  with exactly one primary accounting context per transaction at most.
- Add `credit_context_backfill_runs` for resumable maintenance state; it is not
  a ledger.
- Context IDs and all new context self/FK columns use PostgreSQL `uuid` and
  `gen_random_uuid()`.
- Store namespaced source type/key, root and parent context IDs, bounded live
  display snapshot, resolver version, resolution state, attribution status,
  and lifecycle timestamps.
- New ledger rows carry transaction-time `tenantId`; refunds carry
  `reversalOfTransactionId` and are validated against the original transaction.

## Context and accounting rules

- Context source type and transaction source type are separate validated
  namespaces. Transaction source uses the existing persisted enum; service
  aliases normalize to persisted `other` before storage/filtering.
- Server resolvers, never client labels, decide ownership, title, parent, and
  root. Client IDs and display hints are untrusted.
- Context resolution states `resolved`, `historical_resolved`, `partial`,
  `ambiguous`, `unresolved`, and `archived` map to stable presentation states.
- New required Skill/LLM work fails closed before provider/debit work if an
  invalid or foreign context is supplied. Audited legacy paths may continue as
  explicitly unattributed with a metric.
- Usage is a negative `type=usage` ledger amount. A refund is a positive
  `type=refund` row with one valid reversal link. Admin/system rows are excluded
  from production cost unless an explicit allow-listed work adjustment link is
  present. Invalid over-refunds, reversal chains, self-reversals, duplicate
  reversals, and cross-tenant reversals are integrity exceptions, not named
  cost.
- Parent/root/execution/conversation links explain lineage but only the primary
  work context contributes to work totals. Fixed Skill revenue rows never
  inflate user production cost.

## Required deliverables

1. Schema definitions and additive migration `0264_credit_context_polymorphic_lineage.sql`.
2. Context contracts, registry, resolver, ownership validation, lifecycle
   reconciliation, link writer, audit/metrics helpers.
3. Central `creditService` integration covering debit, model debit, Skill
   settlement, reservations, refunds, idempotency, retries, queues, and
   reconciliation.
4. Caller registry and AST inventory guard covering all production billing
   callers and wrappers.
5. Dry-run-first resumable lineage backfill and read-only audit scripts with
   verified ownership only, checkpoint, lease, parity, and disposition codes.
6. Shared report/accounting service plus protected self/admin summary, detail,
   and CSV/export API procedures with tenant/user authorization and watermark.
7. Credits page context labels, summary/filter/detail/export UX with Thai and
   English copy, responsive/accessibility states, and browser evidence.
8. Tests, metrics, dashboards/queries, and rollout runbook.

## API contract

Preserve existing history fields and append a safe context presentation object
(`status`, `primaryLabel`, `rootLabel`, `workTypeLabel`, `stageLabel`,
`technicalRefsAvailable`). Add `credits.usageByContext`,
`credits.contextUsageDetail`, `credits.exportUsageByContext`, and explicit admin
variants. Reports accept UTC date filters, context/transaction source filters,
root/context IDs, Skill filter, include-unattributed, bounded pagination, and
`asOfTransactionId`. First request captures a max transaction-ID watermark;
subsequent pages/detail/export reuse it.

Summary rows expose charged, refunded, net actual, distinct transaction counts,
labels, attribution status, and deterministic by-work/source/context-source/
Skill/model/stage breakdowns. Totals cover the complete filtered set, not just
the current page, and separately expose unattributed, ambiguous, and integrity
exception amounts.

Self-service always applies authenticated user and current tenant. Admin
surfaces require explicit target tenant, optional target user, existing admin
authorization, tenant predicates before aggregation/label resolution, and an
audit event containing operator, target, filters, and watermark. Raw IDs and
provider/prompt data are never normal UI labels or exported without existing
technical-audit permission.

## Migration/backfill safety

The migration is additive, re-enterable only for compatible objects, and does
not scan or rewrite existing financial rows. Required indexes must be valid
before reports are enabled. Backfill is separate, bounded, resumable, dry-run
by default, and records immutable scan watermark, cursor, lease, counts,
parity, retryable/permanent dispositions, and operator evidence. No row may be
assigned from timestamp, description, same user, Skill slug alone, nearest job,
or unverified trace text. Production rollout requires backup, canary, restore
validation, parity checks, feature flags, and a runbook; it is not performed by
local implementation.

## Non-goals

Do not create a second financial ledger, recalculate balances, infer historical
ownership, introduce provider USD billing/forecasting, change provider APIs, or
deploy/backfill production data as part of local implementation.
