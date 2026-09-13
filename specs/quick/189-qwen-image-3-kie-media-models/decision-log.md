# Decision Log

## Planning depth

- Depth: standard quick-plan.
- Reason: one feature with static catalog, seed, declarative provider routing, data migration, and focused tests; no new service, dependency, auth surface, or cross-team architecture.
- Promotion check: not promoted to full deep-plan because the implementation boundary is already established by GPT Image 2.5 and generic Kie provider patterns.

## Decisions

1. Use two unified rows, Pro and Standard, with reference-driven I2I selection.
2. Use `image_urls` for Qwen3 references and cap the field at three items.
3. Use `resolution` tiers of 30 credits for 1K and 50 credits for 2K for both rows.
4. Add no Python provider branch unless a focused payload test demonstrates a declarative gap.
5. Apply migration `0302` to the configured local database; do not run paid provider generation.

## Plan self-review rounds

- Round 1: verified request coverage, exact model IDs, and two-row product shape.
- Round 2: verified static/seed/migration parity and no schema migration requirement.
- Round 3: verified `image_urls` payload key, reference cap, and empty-reference routing behavior.
- Round 4: verified pricing, test boundaries, dirty-worktree ownership, and no paid side effects.
- Round 5: verified section dependency order, acceptance criteria, and migration/journal sequencing.
- Round 6: clean convergence check; no meaningful `[AUTO-FIX]` items remain.
