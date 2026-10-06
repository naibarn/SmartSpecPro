# Canonical Spec Handoff review passes

Review target: repository state at `2a0dfd7a9b3339fc57010093b2bc9d59d1306630` plus the uncommitted reconciliation candidate in this worktree.

These are finding-driven reviews. Passing framework checks do not mean repository-wide reconciliation is complete; ambiguity and requirement verification remain open.

| Pass | Review focus | Finding and disposition |
|---|---|---|
| 1 | Exhaustive discovery | Inventory includes 436 discovered records and all 436 are represented in the global index; 294 are canonical. Duplicate and malformed candidates remain visible. Verified with `index --check` and `validate --all`. |
| 2 | Schema and source of truth | Manifest, requirement ledger, generated `STATUS.md`, and store writer remain separate; added declared claims as cited inputs instead of lifecycle authority. Schema and tests cover persisted manual decisions. |
| 3 | Authority resolution | Newer IDs/dates do not select a winner. Duplicate target identity is surfaced as ambiguous; regression test added. |
| 4 | Legacy relevance | Requirement extraction now includes goals, section bullets, and success criteria; fenced examples are excluded. Review queue separates assessment priority from implementation continuation. |
| 5 | Full/partial supersession | Feature 130 is recorded as partial supersession by Feature 151, with 191 requirements still open and explicit mapping work; Feature 071's Feature 059 relation remains unresolved because two canonical targets share the ID. |
| 6 | Continuation decisions | Incomplete work is not automatically queued for implementation. Current global queue has no implementation continuation records; review records are kept separate. |
| 7 | Evidence and false completion | Declared completion/status text and deep-implement section states are SHA-cited claims only. Feature 038 targeted verification failed on three requirements; those rows remain FAIL and block completion eligibility. |
| 8 | Lifecycle skill integration | Synced consumers use the shared handoff contract; workflow contract tests verify planning/resume share manifest and exact SHA. Runtime sync verification was previously run for this checkpoint series. |
| 9 | Multi-session and stale writes | Store rejects stale SHA, generation, and spec digest; manual decisions survive reseeding; requirement overrides survive same-digest reconciliation but not normative digest changes. Corresponding tests pass. |
| 10 | Global index and invariants | Rebuilt index and validated: 436/436 records, no missing handoffs, invalid manifests, status drift, or index inequality. Repeat run reports no drift. |
| 11 | Retired feature resurrection | Reconciliation changes only metadata/evidence/tooling. Feature 130 review records no continuation into its legacy implementation; no application implementation was added. |
| 12 | Resume and closure usability | Feature 038 and 130 decisions include next workunit/action and exact-SHA evidence. Remaining requirement mapping and verification are explicit; closure is correctly ineligible. |

## Outstanding convergence work

- Assess the repository-wide review queue rather than treating its 321 records as resolved (2 data-integrity, 2 security, 36 identity conflicts, 35 runtime references, 11 test references, 7 relationship claims, 166 status claims, 62 records without source evidence at this snapshot).
- Map Feature 130's 191 open requirements to Feature 151 or record a supported residual disposition.
- Resolve duplicate-ID relationship targets such as Feature 059 without guessing authority.
- Continue requirement-level verification. Feature 038 has 3 FAIL and 102 OPEN rows; the focused application test subset had 78 passed and 39 failed at the cited integrated SHA.
- Re-run skill/runtime synchronization and the full migration audit on the final integrated SHA.

Framework validation for this candidate: 50 focused tests passed; `compileall`, `index --check`, and `validate --all` passed. This is a partial checkpoint, not migration completion.

## Follow-up review at canonical SHA `6b2314d9681280b9d4e0329c4cad9c1d71ce4406`

- Source-reference counting now deduplicates identical file/line mentions while retaining ambiguity when multiple records share an ID. A dedicated duplicate-ID regression test passes; full reconcile rerun kept all 294 generations and summary fields stable.
- Security Spec `specs/security/20260211` was reviewed against current URL policy, upload handling, library Ops, and focused tests. It is now `ACTIVE_CANONICAL` / `VALIDATION_ONLY` at MEDIUM confidence; 4 requirements PASS, 1 is PARTIAL, 2 are VALIDATION_PENDING. It is not completion eligible.
- Its focused test evidence records 131 passing, 11 failing, 3 skipped, and 37 todo in the 11-file slice; the dedicated 10-file security slice passed, and two unsafe URL tests passed in isolation. The normalized external URL case is blocked by DNS resolution for `cdn.example.com`; this is not claimed as a code pass. The broader library service suite also has mock-contract failures.
- The other dated Security Spec (`20260212`) remains R0 and unclassified. Its requested full TypeScript check is not run in this shared implementation session; use a dedicated runner or CI after reviewing its exact current acceptance evidence.
- Updated reconciliation review queue: R0 data integrity 2, R0 security 1, R1 identity conflicts 36, R1 runtime references 35, R2 test references 11, R3 relationship claims 7, R4 status claims 166, R5 without direct evidence 62 (320 remaining records).

## Follow-up review after parser and writer repairs

- Thai normative headings/keywords are now extracted without treating Thai causal prose outside requirement sections as acceptance criteria. Security Spec `20260212` now has 24 requirement rows instead of one `UNPARSED` placeholder; all remain open except four Phase A/B rows marked PARTIAL by static source evidence.
- Explicit manifest decisions written through the shared writer now persist across reconciliation. Reviewed confidence is bound to the normative Spec digest and expires automatically when that digest changes. Regression tests cover both same-digest persistence and changed-digest invalidation.
- CLI `reconcile --spec-dir` now normalizes relative paths against `--repo`; regression test covers that invocation.
- Full reconcile twice: 294/294 outcomes with stable generations/confidence/requirement counts. Global index: 436/436 records; no missing handoffs, invalid manifests, or drift. Framework suite: 56 tests pass.
- Security Spec `20260211` remains ACTIVE_CANONICAL / VALIDATION_ONLY with 4 PASS, 1 PARTIAL, and 2 VALIDATION_PENDING requirements after full reconciliation.
- Security Spec `20260212` is ACTIVE_CANONICAL / RECONCILIATION_REQUIRED at MEDIUM confidence; full 8 GB package typecheck and critical-flow smoke remain queued for CI/dedicated runner.
- Remaining review queue is 319 records: R0 data integrity 2, R1 identity conflicts 36, R1 runtime references 35, R2 test references 11, R3 relationship claims 7, R4 status claims 166, R5 without direct evidence 62. The queue is still open and is not an implementation backlog.
- Follow-up inventory review reclassified `specs/project/013-features-195-200` as `PROJECT_REQUIREMENTS` because its normative project requirements live at `requirements.deep-project/requirements.md`; it no longer appears as a malformed Spec. `specs/feature/161-vertical-drama-async-skill-jobs` remains malformed because it lacks `spec.md`. Queue is now 318: R0 data integrity 1, R1 identity conflicts 36, R1 runtime references 35, R2 test references 11, R3 relationship claims 7, R4 status claims 166, R5 without direct evidence 62.
