# Plan Adversarial Self-Review — Round 2

## Attack findings

1. **Migration journal collision risk:** the original wording could lead an implementer to
   run drizzle-kit against the character table lineage even though the schema documents a
   pre-existing collision. The plan now names the exact additive fields and requires the
   existing hand-authored idempotent SQL convention.
2. **Prompt ownership ambiguity:** the plan explicitly names lowercase `skill.md` as the
   executable source, uppercase `SKILL.md` as a parity mirror, and `system.prompt.md` as a
   separate mandatory layer. Tests cover ordering and drift.
3. **Legacy role drift:** every creation/reconciliation path now preserves the old role,
   uses canonical fields for decisions, and marks low-confidence cases for review.
4. **UI evidence gap:** the UI section includes required and extended viewport matrices,
   keyboard/accessibility acceptance, copy, token reuse, and browser evidence.

## Structural recheck

- Shared contract is created before all consumers.
- Manual SQL migration precedes backfill and runtime V2 normalization.
- Runtime removal of the marker composer occurs only after skill semantic gates exist.
- UI consumes the shared contract and is verified after DTO/runtime changes.
- Visual QA routes revisions back through the Skill and never creates a second prompt owner.

## Result

No unresolved high-confidence gaps remain. Plan is ready for TDD section generation.
