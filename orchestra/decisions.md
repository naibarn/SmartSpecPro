# Orchestra Decisions — Spec 214

[2026-09-26T00:39:07Z] DECISION: Archive the prior unrelated Orchestra audit before starting Spec 214.
  Context: Existing root state covered Specs 231–248 and was completed; mixing its evidence into this task would make lifecycle status ambiguous.
  Alternatives considered: overwrite/reuse existing artifacts (rejected); safe archive helper moved it to `.orchestra-archive/20260926T003907Z`.

[2026-09-26T00:45:00Z] DECISION: Use targeted shell discovery because SocratiCode tools are unavailable.
  Context: No SocratiCode/codebase tools were registered in this runtime; repository policy allows targeted shell fallback.
  Alternatives considered: broad repository scan (rejected as noisy in a heavily dirty worktree).

[2026-09-26T00:50:00Z] DECISION: Keep production cutover and data migration fail-closed pending read-only deployed data inventory and rollback plan.
  Context: Spec 214 itself acknowledges persisted Workflow Studio structures and requires inventory before removing old identifiers; current environment supplies no production data/deployment evidence.
  Alternatives considered: infer no persisted workflows from local code (rejected as unsupported).
