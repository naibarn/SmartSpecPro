# Decision Log

## Planning depth

- Depth: `standard`
- Sections: 3
- Reason: the change crosses a skill contract, server context/persistence, and one existing
  client handoff, but needs no migration, new endpoint family, dependency, or visual redesign.
- Promotion trigger: promote only if implementation discovers a required schema migration,
  tenant-wide authorization change, or a new paid reconciliation call.

## Key decisions

1. Use the existing JSONB visual bible; no new archive table.
2. Use owner-and-tenant-scoped recent series, not tenant-wide cross-owner history.
3. Keep candidate generation inside the existing single LLM call.
4. Add structured DNA additively to the static skill schema while requiring it in the
   active Characters-tab runtime validator.
5. Use an atomic nested JSONB update for `data.visualBible`; never replace full `data`.
6. Persist after media-task submission succeeds.
7. Portrait preview carries DNA only when the confirmed prompt is unchanged after trim.
8. Character Sheet stays direct and persists the just-generated validated DNA.
9. Legacy approved-prompt callers without DNA continue rendering without persistence.
10. Run code review inline because sub-agent dispatch was not requested and the repository's
    shared Orchestra state is already occupied.
11. Do not stage or commit because the user requested implementation, not git publication,
    and the worktree contains overlapping user changes.

## Review log

Planning self-review rounds are appended here. Completion requires at least five rounds and
two consecutive rounds with no meaningful auto-fix.

### Round 1 — AUTO-FIX

- Completeness: identified that the existing 3500-token completion cap may truncate the new
  DNA while five prompt fields remain mandatory. Added a bounded increase requirement.
- Security/abuse: identified missing explicit browser snapshot and context size limits.
  Added allowlist/truncation, 30-current-cast cap, and strict transport caps.
- Contradictions: none after fixes.
- Obvious missing improvement: none beyond the applied bounds.

### Round 2 — AUTO-FIX

- Completeness: traced section dependencies and found a potential circular import between
  the new context loader and prompt-generation service.
- Security/abuse: owner filters remain required at the DB loader boundary.
- Contradictions: resolved by making shared Zod/types the only cross-service contract and
  forbidding the prompt service from importing the DB loader.
- Obvious missing improvement: documented archive-degradation versus blocking current-cast
  behavior in the router plan.

### Round 3 — AUTO-FIX

- Completeness: found that naively taking five series before loading characters lets empty
  drafts consume the whole comparison window.
- Security/abuse: retained the same owner+tenant boundary and added a hard fifteen-series
  candidate cap.
- Contradictions: none after defining "five recent" as five recent series with usable lead
  evidence within that bounded candidate window.
- Obvious missing improvement: added a regression test expectation for empty drafts.

### Round 4 — CLEAN

- Completeness: every approved-design requirement maps to a section and test boundary.
- Contradictions: manifest order, file ownership, portrait-preview behavior, and direct
  Character Sheet behavior are consistent across all artifacts.
- Security/abuse: tenant+owner scoping, snapshot caps, correlation, and JSONB sibling-key
  preservation are all explicit.
- Obvious missing improvement: none found.
- Verification: required planning files exist and manifest names match section files.

### Round 5 — CLEAN

- Completeness: rechecked request, research, implementation plan, TDD plan, and all three
  sections against the approved design; no uncovered acceptance criterion remains.
- Contradictions: none found; sequential dependencies and file ownership remain coherent.
- Security/abuse: no permission, data-boundary, prompt-injection, or unbounded-payload gap
  found in the written plan.
- Obvious missing improvement: none found.
- Verification: `git diff --check` passed for the design and quick-plan artifacts.

Stop reason: two consecutive clean rounds reached. Package is ready for deep implementation.
