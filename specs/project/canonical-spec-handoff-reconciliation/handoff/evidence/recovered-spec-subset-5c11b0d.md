# Partial recovered Spec upload checkpoint

- Canonical ref: `refs/heads/main`
- Previous canonical SHA: `151c419fa7a2a3befba2ff3259834ede008ebf50`
- Integrated merge SHA: `5c11b0d671bddbd63e9fe425d3c0c98bf99db463`
- PR: https://github.com/naibarn/SmartSpecPro/pull/60
- State: partial upload; migration remains `WAITING_POST_RECOVERY_SPEC_UPLOAD`.

## Integrated candidate Specs

Specs 271, 276, 277, 279, 280, 283, 284, 285, and 286 were copied byte-for-byte from the prepared candidate source and integrated. The exact-SHA inventory dry-run at `5c11b0d` reports 302 `CANONICAL_SPEC` records, 445 total records, a complete walk, and no diagnostics. Each of the nine Specs is classified `CANONICAL_SPEC` with no duplicate ID or revision relationship.

No global Spec index/status, reconciliation report, continuation queue, ambiguity review, relationship graph, or per-Spec reconciliation output was regenerated.

## Candidates still held

- Spec 278: candidate and current canonical file share ID 278, revision 1.4, and path but have different normative digests. Existing provenance evidence links the candidate blob to a recovery branch commit not ancestral to main; no source has been selected.
- Spec 282: candidate and current canonical Spec share ID 282 and revision 1.0 at different paths, with different digests. Candidate provenance remains unresolved.
- Spec 281: source is preserved unchanged; it lists Docker/OCI containers as deployment targets, which conflicts with the repository's retired Docker/OpenSandbox runtime boundary.

The recovered/canonical set is therefore not yet fully uploaded, validated, and integrated. Do not run bulk reconciliation or regenerate final inventory-derived outputs. Keep the migration state `WAITING_POST_RECOVERY_SPEC_UPLOAD`.

## Resume predicate and next action

Resume only when the remaining candidates have an evidence-backed authority/policy disposition, the selected canonical set is uploaded and validated, and that set is integrated into `origin/main`:

`Recovered/canonical Spec set has been uploaded, validated, and integrated into canonical ref`

Then refresh inventory, validate all handoffs, regenerate inventory-derived views, rerun inventory-dependent scenarios 8, 9, 10, 11, 19, and 20, and resume repository-wide reconciliation.
