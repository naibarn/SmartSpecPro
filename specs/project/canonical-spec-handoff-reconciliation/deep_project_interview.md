# Deep Project Interview

## Source

The user supplied a detailed 32-section request in the pasted-text attachment. It explicitly authorizes design, implementation, and repository-wide Spec reconciliation.

## Clarifications inferred directly from the request

- This is a framework plus metadata migration, not feature implementation for each incomplete Spec.
- Normative legacy `spec.md` files are read-only by default.
- Existing lifecycle and handoff concepts must be audited and reused; a competing status engine is prohibited.
- All Specs must be found dynamically. Spec IDs in examples cannot constrain inventory.
- Canonical authority, disposition, implementation lifecycle, continuation decision, confidence, and evidence are separate facts.
- Ambiguous legacy/product questions are consolidated into a review queue; do not interrupt the user Spec-by-Spec.
- Completion/verification/deployment/acceptance claims require evidence tied to exact revisions.
- Repository-wide TypeScript, application builds, and UAT are outside the metadata-only verification default; the repository AGENTS restriction on local full typecheck applies.
- Existing uncommitted work is unrelated and must remain untouched.

## Discovery limitation

SocratiCode tools were not exposed in the active tool catalog, so repository discovery uses bounded shell searches, manifests, and filesystem traversal. Initial filesystem evidence on fetched `origin/main` found 304 `spec.md` files across six top-level areas; these include canonical Specs, historical/alternate roots, nested child specs, and non-canonical templates, so the final canonical count must come from explicit root policy plus recorded classification rather than this raw count.

## Open product questions

None block framework design. Evidence that cannot distinguish current product intent must remain `LOW`/`UNRESOLVED` with `RECONCILIATION_REQUIRED` or `HUMAN_PRODUCT_DECISION_REQUIRED`, collected into the consolidated ambiguity report.
