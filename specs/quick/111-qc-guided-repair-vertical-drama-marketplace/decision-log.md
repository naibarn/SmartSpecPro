# Decision log

## Planning depth

Chosen: standard quick plan.

The feature crosses two domains, but both already expose the required durable
ledger/artifact/outbox boundaries and the approved design deliberately keeps
domain adapters separate. No new service or schema migration is required by
the plan. Promote to full deep-plan if implementation discovers that artifact
read/selection requires a new persistence model or a third independent domain.

## Core decisions

1. Keep Vertical Drama and Marketplace QC rubrics separate.
2. Add explicit repair operations rather than mapping repair to a normal QC run.
3. Persist candidate lineage before any candidate selection; do not overwrite
   source content.
4. Re-evaluate the repaired candidate once and require explicit selection after
   a passing result.
5. Trust no client-provided score, repair path, or draft as an authority.
6. Keep Marketplace approval as a hard Creative QC pass gate.
7. Reuse current Draft Ledger, Marketplace artifact table, outbox, and
   idempotency mechanisms before considering migration.

## Review round 1

[AUTO-FIX] Clarified that a structurally valid repaired candidate is still not
active automatically; only a passed candidate can be explicitly selected.

## Review round 2

[AUTO-FIX] Added the Marketplace selection/plan-revision step after repair so
approval cannot observe an unselected repair candidate.

## Review rounds 3-5

No further meaningful gaps found in scope, ownership, tenant checks, or failure
handling.
