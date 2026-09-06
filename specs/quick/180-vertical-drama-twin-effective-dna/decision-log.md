# Decision Log

## Planning depth

- depth: standard quick-plan
- reason: cross-domain but bounded to the existing Vertical Drama character, prompt,
  episode pipeline, and UI surfaces; no new table is required.
- promotion triggers: a new normalized twin-group table, cross-service worker changes,
  or more than five independent UI surfaces would promote this to full deep-plan.

## Decisions

1. Keep `sharesFaceWithCharacterId` as the durable compatibility relation.
2. Resolve the relation symmetrically for UI/validation even though storage remains
   one-way, avoiding a schema migration and preserving existing rows.
3. Materialize shared age/face fields into both visual-bible DNA snapshots on repair,
   with source id/revision provenance; local style/personality fields stay editable.
4. Episode generation reloads current character rows and assets immediately before
   prompt/image generation; it does not trust stale storyboard identity snapshots.
5. Existing media is never regenerated or charged automatically. Stale/incompatible
   state is surfaced as an explicit user action.
6. Legacy repair is allowed only for an unambiguous pair (series 53 ids 192/193); the
   generic repair endpoint refuses ambiguous matches.

## Plan self-review rounds

- Round 1 — scope/completeness: all requested surfaces (relationship, DNA, episode
  hydration, UI, legacy repair, tests) are covered; no auto-fix.
- Round 2 — contradiction check: one-way storage versus symmetric display is explicit;
  materialized DNA and runtime effective DNA have matching provenance requirements; no
  auto-fix.
- Round 3 — security/data safety: all writes are tenant/user/series scoped and no paid
  action is part of repair or validation; no auto-fix.
- Round 4 — failure modes: missing canonical identity, stale storyboard, ambiguous
  inference, and incompatible variants fail closed with actionable states; no auto-fix.
- Round 5 — UI contract: target user, existing patterns, state/responsive/a11y/copy,
  and browser evidence are present; no auto-fix.

Two consecutive rounds completed with no meaningful `[AUTO-FIX]` items.
