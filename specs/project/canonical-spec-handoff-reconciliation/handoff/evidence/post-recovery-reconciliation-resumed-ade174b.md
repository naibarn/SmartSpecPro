# Post-recovery reconciliation resume — 2026-10-06

## Canonical upload checkpoint

The recovered Spec set was integrated in `refs/heads/main` at `ade174b306e6e4fcc9b078a616fa1a5634686722` (PR #63, merged 2026-10-06T03:12:48Z). The resume predicate is satisfied: `Recovered/canonical Spec set has been uploaded, validated, and integrated into canonical ref`.

Disposition evidence is in `post-recovery-dispositions-20261006.md`. Spec 278 remains current main; Spec 281 remains active with the policy-conformance amendment; current Spec 282 remains canonical; Adaptive Work Context is canonical Spec 292 with original provenance. Semantic references in Specs 284/285 now point to 292. IDs 290/291 remain reserved but have no canonical source files in this checkout.

## Refreshed inventory and relationship mapping

- 291 canonical Specs, 17 project-requirement records, 25 historical candidates, 112 planning artifacts, one identical Spec copy, and one malformed candidate missing `spec.md`.
- 447 discovered records equal 447 indexed records; walk complete, no diagnostics.
- 286 relationship edges generated.
- No duplicate-revision pairs. No duplicate ID/revision conflict for Specs 278, 281, 282, or 292.
- Eight other duplicate Spec IDs remain evidence-review items (16 records); no authority winner is inferred.
- The generated ambiguity-review projection contains 315 open reconciliation-review records. These are fresh post-recovery records, not the pre-recovery provisional set of 317 source reviews / 318 prior projection rows. Do not close them without record-specific evidence.

The refreshed projection currently contains 289 LOW-confidence and 26 UNRESOLVED records. The single configured feature-root malformed candidate `specs/feature/161-vertical-drama-async-skill-jobs` remains visible because it has no `spec.md`.

## Inventory structural correction

The current inventory exposed that numbered leaves beneath `requirements.deep-project` were being counted as canonical Spec IDs. They remain individually discoverable and indexed as `PROJECT_REQUIREMENTS`, but their local sequence numbers no longer create repository-wide Spec-ID collisions. Store/reconciliation identity metadata now uses the same parser as dynamic inventory, including bold `Revision: R1.0` metadata. Focused inventory/store/reconcile tests pass.

## Verification and next work

- 40-case scenario matrix: all 40 pass after post-recovery inventory checks; scenario 8 has no live duplicate-revision pair and uses no invented repository fixture.
- `python3 -m tools.spec_handoff index --check`: clean.
- `python3 -m tools.spec_handoff validate --all`: 291 canonical Specs, no missing handoffs, no invalid manifests, global invariant passes, walk complete.
- Migration remains open. Next work unit: review the eight remaining duplicate-ID groups and then continue the 315-record evidence-based reconciliation queue; preserve unresolved decisions where repository evidence is insufficient.
- Framework regression suite: `python3 -m unittest discover -s tools/spec_handoff/tests -v` — 72 passed.
- Skill audit: `bash skills/audit-skills.sh` — PASS (structure audit, installed sync, 330 tests, lifecycle policy tests).
