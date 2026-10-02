# Spec 215 — 10-Round Completeness and Cross-Consistency Audit

วันที่ตรวจ: 2026-09-28  
Scope: current `specs/feature/215-workflow-compiler-runtime-execution-architecture/spec.md`, current source contracts/tests, and linked Specs 212, 214, 220, 225, 226, 229 plus Feature 195. Production database, provider, deployment, and account state were not accessed.

## Round ledger

| Round | Review lens | Finding and action |
|---:|---|---|
| 1 | Document identity, path, revision and status | Found the current header at R4 while later content represented a new retrieval amendment and dated 2026-09-27. Bumped to R5 / 2026-09-28 and named the retained R4 + proposed R5 amendments. |
| 2 | Spec 214 contract identity | Body used “Spec 214 v4” ambiguously while Spec 214 is R6 and its manifest schema is v4. Added an explicit version definition and updated current integration clauses to Spec 214 R6 / schema v4. |
| 3 | Code-to-contract trace | `workflowNodeContracts.ts`, `workflowCompilerRuntimeContracts.ts`, `workflowStudioRuntime.ts`, `routers/workflowStudio.ts` and migration 0341 show partial contracts, selected-node job-plan construction and persisted Studio surfaces. Added a dated snapshot and explicit unproven runtime boundaries. |
| 4 | Workflow persistence and cutover safety | Section 68 required an inventory but then categorically called cutover “not workflow-data migration.” Replaced that contradiction with conditional migration/adapter or retention policy, and made compatibility-code removal contingent on inventory and rollback proof. |
| 5 | Spec 212 baseline and acceptance identity | A quorum clause still targeted Revision 16 while current Spec 212 is R20; completion text did not identify the current corpus. Updated both to R20. |
| 6 | Physical jobs vs logical workflow authority | Checked Feature 195 boundary against `worker_jobs`, outbox gateway and runtime plan. Spec retains logical Spec 215 / physical Feature 195 ownership; no second queue or ledger introduced. |
| 7 | Retrieval ownership and runtime behavior | Found no Retrieval Broker requirement in the current Spec 215 text despite `data.retrieval` support and Spec 229’s mandatory `SAH-RETRIEVAL-2` boundary. Added Section 76 with scope, evidence/provenance, ACL, partial/degraded, outage and release-gate rules. |
| 8 | Cross-device, Creator and Skill boundaries | Replaced the stale assertion that Spec 215 was unimplemented with an accurate partial-contract statement. Marked the missing Spec 251 artifact as an unresolved dependency; clarified that Skill instructions alone cannot satisfy executable capability binding. |
| 9 | Acceptance, legacy handling and historical amendments | Fixed “Spec 215 v2 complete,” duplicate top-level `#70`, and ambiguous clean-slate language. Marked the R2 30-pass section as historical and made the 112-name rejection apply to new canonical definitions without authorizing deletion or unreadability of existing records. |
| 10 | Adversarial contradiction and structural scan | Checked headings, fences, revision refs, old assumptions, retired systems, acceptance cases and diff whitespace. Found no further local contradiction after repairs. |

## Repairs and remaining gates

Updated Spec 215 header to R5; added a source-alignment snapshot; aligned current Spec 214 / Spec 212 references; corrected the cutover and historical-clean-slate boundaries; repaired section numbering; and added the missing Retrieval Broker contract boundary. The Creator R4 interface still references Spec 251 as proposed only because no Spec 251 artifact exists in this checkout; its owner contract must be located before cross-spec implementation.

Spec 229 reports that a canonical Retrieval Broker V2 runtime and unified consumer migration are not present. Section 76 therefore keeps production retrieval unavailable until the Broker adapter, Spec 220 authorization, and runtime acceptance gates are proven. These are external implementation gates, not claims of completion.

## Post-fix convergence

- Round 11: re-read all changed requirements against Specs 212 R20, 214 R6/schema v4, 229 `SAH-RETRIEVAL-2`, Feature 195 and the local source snapshot. No new gap found.
- Round 12: re-ran contract tests and structural/static checks after the last edit. No regression found.

Verification:

- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 pnpm exec vitest run server/services/__tests__/workflowCompilerRuntimeContracts.test.ts` — **PASS**, 1 file / 10 tests.
- Python structural check — **PASS**, 2,110 lines; 77 fenced blocks balanced; 77 unique numbered top-level sections; current pins/data gate/retrieval boundary present.
- Scoped retired-system search — **PASS**, no matches.
- `git diff --check -- specs/feature/215-workflow-compiler-runtime-execution-architecture/spec.md` — **PASS** after removing trailing whitespace from the updated date field.
- Repository-wide TypeScript check not run under the repository RAM policy. No production database, deployment, provider, or retrieval E2E verification was performed.

Status: local document/source-contract audit converged after 12 rounds. Production migration, full runtime, Spec 251 ownership, Retrieval Broker V2, and provider/account certification remain open external gates.

## Repeat audit cycle — 10 additional rounds (2026-09-28)

The user requested a fresh verification cycle. Rechecked the current Spec 215 working copy, relevant code surfaces, and cross-spec contracts. No changes were found to the source files used by the prior snapshot; the current `main` document still contains uncommitted audit edits.

| Round | Review lens | Result |
|---:|---|---|
| 13 | Working-copy and prior-cycle delta | Confirmed the prior R5 document and audit report are present; identified the additional source-of-truth statements to recheck. |
| 14 | Schema/version identity | Confirmed WorkflowDefinition schema v2, plan contract `spec-215-v3`, and Spec 214 R6 manifest schema v4 are distinct versions. Found §68 step 7 did not say which “v4” it meant; corrected it. |
| 15 | Spec 212 coverage identity | Rechecked R20 references and current corpus requirement; no new mismatch. |
| 16 | Spec 214 type contract | Rechecked 16 core IDs and R6/schema-v4 binding; no alias or second registry added. |
| 17 | Feature 195 authority vs transport | Compared `worker_jobs` with Spec 232 G6 and Spec 245 cutover model. Found R4.3 could imply all long-media families had already migrated. Reworded it as canonical ownership plus per-family transition gate. |
| 18 | Cloudflare execution placement | Rechecked Spec 232’s long-task/container/Runner limits against the R4.3 prohibition on long FFmpeg work in short Worker requests; consistent. |
| 19 | Creator handoff and command authority | Rechecked Specs 225/226; clarified attention delivery vs client action/command ownership and retained integration as a release gate. |
| 20 | Retrieval boundary | Rechecked Spec 229 `SAH-RETRIEVAL-2`, missing Broker runtime, ACL/provenance and partial/degraded semantics; no new gap. |
| 21 | Security, failure and recovery | Rechecked current authorization, replay ACL validation, external unknown outcomes, idempotency and cancellation language; no new contract contradiction. |
| 22 | Adversarial structure/proof review | Rechecked historical language, section numbering, version references, fence balance and retired-system scan; no further gap. |

### Repeat-cycle convergence

- Round 23: after edits, re-read the changed clauses against Specs 212/214/220/225/226/229/232/245 and Feature 195. No new finding.
- Round 24: reran focused compiler-contract tests, structural validation and diff checks after the final edit. No regression.

Repeat-cycle verification:

- `JWT_SECRET=test-jwt-secret-32-chars-minimum-1234567890 pnpm exec vitest run server/services/__tests__/workflowCompilerRuntimeContracts.test.ts` — **PASS**, 1 file / 10 tests.
- Structural check — **PASS**, 77 fenced blocks balanced, 77 unique numbered top-level sections; updated schema/job-boundary assertions present.
- Scoped retired-system scan — **PASS**, no matches.
- `git diff --check` for Spec 215 and this report — **PASS**.

Repeat-cycle repairs: clarified §68’s schema-version wording; clarified that canonical `worker_jobs` ownership does not prove all long-media job families are already migrated; clarified Spec 225 attention vs Spec 226 command/action roles. Production/runtime/Spec 251/Broker gates remain open as stated above.
