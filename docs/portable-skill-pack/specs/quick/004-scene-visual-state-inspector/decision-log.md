# Decision Log

## Planning depth

**standard quick-plan** — the work is a focused Vertical Drama feature crossing
one shared JSON contract, one existing mutation, the Location UI, and focused
tests. It does not require a new service or database table. It stays in
quick-plan if implementation remains within these boundaries.

## Decisions

1. Extend the existing shared state contract with an optional structured
   `sleepSurface` object rather than trying to infer bed semantics from prose.
2. Keep the Inspector in `VerticalDramaSceneLockRow`/Location UI and make it a
   collapsible inline panel, not a new page or global modal workflow.
3. Use visible Thai helper copy for the purpose, scope, each editable group, and
   save impact. English remains the fallback for the existing bilingual UI.
4. On state save, mark every member frame with the existing
   `imageStaleReason: "prompt_changed"` and `imageStaleAt`; preserve all image
   anchors and clear state-dependent continuity QC.
5. Do not add per-shot overrides or automatic regeneration in this increment.
6. Keep the current paid AI re-plan action explicit and separate from the
   zero-cost manual edit action.

## Review rounds

- Round 1: identified that stale propagation needed an exact existing field.
- Round 2: aligned the plan with `imageStaleReason`/`imageStaleAt` and legacy
  JSON compatibility.
- Round 3: added copy/localization, responsive, accessibility, and browser
  evidence requirements.
- Round 4: checked section ownership, transaction boundaries, and no-image
  prompt behavior.
- Round 5: final consistency check; no blocking gaps remain.
