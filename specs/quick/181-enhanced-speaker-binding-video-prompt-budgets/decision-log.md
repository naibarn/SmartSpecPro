# Decision log

- Depth: standard quick plan with two implementation sections.
- Speaker strategy: speech events are canonical-data-only; free-form actions become separate sanitized events. This is safer than name parsing and less disruptive than changing the prompt-intent schema.
- Budget strategy: known family ceilings are matched from model identity; explicit video configuration may tighten a known ceiling but not raise it. Unknown models use explicit configuration then the legacy default.
- Compaction strategy: Enhanced terminal prompt is compacted deterministically while retaining a protected semantic core; it fails closed if the core cannot fit.
- No migration: runtime resolution fixes correctness without touching existing rows in a dirty migration worktree.

Plan review rounds:

1. Coverage: added exact episode 258 speaker/action regression requirement.
2. Contradictions: removed provider-wide Kie.ai assumption and made limits model-aware.
3. Security/data: confirmed no auth, tenant, DB mutation, paid call, or credential requirement.
4. Integration: added all resolver call sites and Enhanced fingerprint/budget propagation.
5. Obvious missing improvement: added deterministic protected-core compaction and unknown-model fallback tests.
6. Clean review: no meaningful auto-fix item.
7. Clean review: no meaningful auto-fix item; plan stabilized.
