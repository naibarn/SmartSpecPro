# Decision Log

## Planning depth

- depth: standard
- reason: four coordinated sections across catalog, prompt generation, prompt
  QC, and storyboard provenance; still bounded to one Vertical Drama defect
  family and no DB schema migration.
- promotion triggers: a required relational migration, destructive artifact
  rewrite, or more than five implementation sections.

## Decisions

1. Runtime family invariant is authoritative; explicit seed metadata remains a
   CI-audited redundancy.
2. Grok classification requires media type `video` plus token-aware Grok
   identity from model id/provider model id/aliases when present.
3. Native prompt compliance is checked after LLM output and again after final
   transforms; deterministic append is the last safe fallback.
4. Prompt QC receives protected verbatim fragments and fails explicitly if the
   mandatory fragments cannot fit.
5. Storyboard-derived artifacts are preserved and marked stale, never deleted.
6. Legacy provenance is unknown and visible; paid reuse is blocked until
   reconcile/regenerate.
7. Backfill is a standalone report/apply tool with JSON backup and restore
   instructions; it is not run automatically.

## Self-review log

- Round 1: added future-provider and image-model negative cases.
- Round 2: required the backfill to call the runtime classifier.
- Round 3: added final-transform dialogue validation and cap-conflict behavior.
- Round 4: added dirty-worktree boundaries and no-production-mutation rule.
- Round 5: verified section ownership/dependency order; no meaningful fixes.
- Round 6: repeated completeness/contradiction/security review; clean.

