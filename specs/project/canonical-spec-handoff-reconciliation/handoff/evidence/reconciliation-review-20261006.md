# Repository-wide reconciliation review — 2026-10-06

## Baseline and inventory

- Source baseline: `origin/main` / `9ab681181a6ac850a366bb92ebf5dc024029655b`.
- Reconciliation implementation integrated by PR #80 at `main` SHA `c72b38df94391656b913f2d1635b97e6ac0c1440`.
- Dynamic inventory: 305 canonical Specs, 463 records, 331 ambiguity-review records.
- Relationship projection: 302 candidate edges; duplicate canonical authority count: 0.
- Six renumber aliases validate; eight duplicate-ID groups remain closed.
- Record-level classifications cover every inventory key exactly once in generated projection `specs/_status/reconciliation-classifications.json`. Review classifications: 302 `CANONICAL_ACTIVE`, 1 `SUPERSEDED`, 26 `VALID_NON_CANONICAL`, 1 `IMPLEMENTATION_EVIDENCE`, 1 `UNRESOLVED_AUTHORITY`.
- Full inventory classifications additionally include 1 `DUPLICATE_REVISION` and 129 further `VALID_NON_CANONICAL` planning/project requirement records; totals equal 463.
- Exact `307 → 305` bridge is in `canonical-count-bridge-20261006.md`; six renumber additions and six replaced IDs net to zero, then two historical/non-Spec records are demoted.

| Classification | Full inventory | Of remaining 331 | Remaining unclassified/unresolved |
|---|---:|---:|---:|
| `CANONICAL_ACTIVE` | 304 | 302 | 0 |
| `HISTORICAL_REVISION` | 0 | 0 | 0 |
| `SUPERSEDED` | 1 | 1 | 0 |
| `RENUMBER_ALIAS` | 0 | 0 | 0 |
| `IMPLEMENTATION_EVIDENCE` | 1 | 1 | 0 |
| `RECOVERY_EVIDENCE` | 0 | 0 | 0 |
| `DUPLICATE_REVISION` | 1 | 0 | 0 |
| `STALE_REFERENCE` | 0 | 0 | 0 |
| `ORPHANED_RECORD` | 0 | 0 | 0 |
| `VALID_NON_CANONICAL` | 155 | 26 | 0 |
| `UNRESOLVED_AUTHORITY` | 1 | 1 | 1 |
| **Total** | **463** | **331** | **1** |

The six renumber aliases are validated provenance entries outside the 463 inventory, so the `RENUMBER_ALIAS` inventory count remains zero.

## Remaining authority blocker

Only `specs/feature/161-vertical-drama-async-skill-jobs` remains `UNRESOLVED_AUTHORITY`. Its canonical-root directory has no normative `spec.md`; `claude-spec.md` identifies itself as synthesized from an approved design, and downstream Specs reference the behavior. No authoritative source or decision permits promoting the synthesized document to normative authority or retiring the record. Preserve it and recover the approved source or obtain an authoritative disposition before repository-wide closure.

## Skill audit hygiene

- Initial local runtime output found: 3 `.venv`, 3 `.pytest_cache`, and 13 `__pycache__` directories under skill sources; none were Git-tracked. The isolated worktree had no active skill test process before cleanup.
- Cleanup guard confirmed all artifacts were ignored/untracked, then the isolated worktree cleanup removed them. Cleanup now refuses if any runtime artifact contains tracked files.
- Scanner now prunes runtime directories and uses set-based tracked classification; runtime audit remains strict for both tracked contamination and ignored local output.
- Audit/test commands disable Python bytecode and pytest cache, and test virtualenvs are created outside distributable skill directories. Portable install/sync views exclude test-only files.
- Skill audit: PASS. Orchestra audit tests: 13 passed. Existing deep-plan/deep-implement/deep-project package suites: 330 + 139 + 166 = 635 passed.

## Verification

- `python3 -m tools.spec_handoff index --check`: PASS, 463 records / 305 canonical Specs, no drift.
- `python3 -m tools.spec_handoff validate --all`: PASS, no missing/invalid handoffs, complete walk.
- `python3 -m tools.spec_handoff classifications --check`: PASS, exact dynamic inventory and review-set coverage; one unresolved authority.
- `tools/spec_handoff` unit suite: 80 tests; alias/provenance, relationship, classification, and 40-case coverage-matrix checks included.
- The 40-case matrix is framework evidence mapping, not a standalone 40-case executable suite. Its 40 entries are checked for framework-pass state and current inventory facts.
- Full repository typecheck/build and production/deployment checks were not in scope and were not run.

## Outcome

`REPOSITORY_WIDE_SPEC_RECONCILIATION_COMPLETE = FALSE` while Feature 161 remains unresolved. Keep `REVIEW_REMAINING_RECONCILIATION_RECORDS` as the next workunit. Do not close `CANONICAL_SPEC_HANDOFF_MIGRATION_COMPLETE`; after repository-wide reconciliation is true, the next gate is `FINAL_CANONICAL_SPEC_HANDOFF_MIGRATION_GATE`.
