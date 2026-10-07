# Authority Recovery, Workspace Convergence, and UAT Evidence

Evidence snapshot and targeted test source: `55a0786a7359f578e0f68743a6551eaa7f588596`, fetched 2026-10-07 04:54 UTC. SPEC-268 recovery PR #163 merged at `a4c5c85f51205c445107e33f6929fe5649d2836b`. Latest fetched `origin/main` is `0a0b597e26ca98fb64a02189471775a580ddf0cc` (PR #165); the test snapshot remains exact, but later commits mean it is not a verification run against the current tip. Source Spec/Handoff paths had no overlap with newer main changes; generated indexes were regenerated on the current base. This addendum continues prior work; it does not recreate Spec drafting or the 15 review lenses.

## A. SPEC-268 R2.5 disposition

**Disposition: `RECOVERED_AUTHORITATIVE_R2_5`; R2.6 additive amendment is canonicalized in this change.** The exact R2.5 source was recovered from `SpecR7.zip`, an archive attached in the 2026-10-05 session. Archive integrity passed. Entry `SPEC-268-SmartAIHub-Unified-Memory-R2.5-Work-Context-Evidence-Alignment.md` is 310,534 bytes with SHA-256 `1804759f845dafb5412886114a192e9703b9e5550dfa98c0a06d048878adb978`.

Provenance is independently corroborated by `/home/dev/.codex/sessions/2026/10/05/rollout-2026-10-05T19-44-10-01a10c17-d42f-78e3-af34-9bd6eb87ecb6.jsonl`: records 87–90 show the archive entry selected, mapped to `specs/feature/268-smartaihub-unified-memory-r2-5-work-context-evidence-alignment/spec.md`, copied, and verified with the same SHA/length. The byte-identical source is retained under the canonical Spec directory's `recovery/` folder, and `provenance.json` records source, hash, mapping, and method. This is recovery from an attached archive; it is not evidence that the R2.5 file had previously been integrated into `origin/main`.

Canonical `spec.md` preserves the R2.5 content and adds a separately labeled R2.6 amendment. R2.6 corrects current normative mappings (`SPEC-282` Work Context → `SPEC-292`; portable Mini-App Knowledge → `SPEC-281`) without rewriting historical quotations, defines the multi-axis memory lattice and `MemoryContext`, sets the SPEC-302 resolution receipt/state boundary, blocks durable Project writes for ambiguous/unresolved scope, clarifies clone/transfer privacy, and retains the inventory → bridge → migrate → reconcile → retire Chat-memory sequence. No runtime or production completion is claimed. SPEC-268 remains the memory authority; SPEC-302/269/292/281 retain their separate identity, Chat, Work Context, and portable knowledge boundaries.

The audit input ZIP `/home/dev/projects/SmartSpecPro/.tmp-audit-download/SmartSpecPro-True-Latest-Audit-2026-10-07.zip` remains separate evidence and does not contain the R2.5 source. The earlier `EXTERNAL_SOURCE_REQUIRED` conclusion was superseded by the exact archive entry and matching session import record. External Spec Library status remains unverified.

## B. Repository authority for Specs 302–304

`REPOSITORY_ID_AUTHORITY_VALID = TRUE` for IDs 302, 303, and 304. Dynamic inventory at the evidence source has exactly one canonical record for each. The Spec-ID registry lists each as occupied, with no reservation, historical-ID, alias, or historical-disposition hit. Their Handoffs all point to integrated source `3d6d1a3a6e3f9ee8dcce1a55fb3965c06fe61dc5`.

`EXTERNAL_SPEC_LIBRARY_COLLISION_CHECK = NOT_VERIFIED`. No external Spec Library connector/export was available; this does not invalidate repository-local uniqueness. Repository reference closure now resolves, including SPEC-268 after recovery. SPEC-268 runtime acceptance remains separate from source/ID authority.

## C. User workspace ownership and recovery

Latest authority observation: `/home/dev/projects/SmartSpecPro` is registered as `CANONICAL_USER_WORKSPACE`; branch `codex/p0-wu4c-handoff-reconcile-20261007`; HEAD `1a30722479d6cb44f53f07dc411d7521df347aaa`; owner `NONE`; no active session; `task_id=null`; dirty path count 2. HEAD is already an ancestor of current `origin/main`, so there are zero unique local commits. The branch is stale, but its commit history is integrated.

| Exact changed path | State | Classification | Already in `origin/main` | Recovery |
|---|---|---|---|---|
| `apps/web/finance-ocr-debug.jsonl` | Unstaged tracked modification; appended generated OCR/debug trace rows | `GENERATED` | No | The exact unstaged patch is preserved and SHA-256 verified. No active owner/task assignment was found. |
| `.tmp-audit-download/SmartSpecPro-True-Latest-Audit-2026-10-07.zip` | Untracked user-provided audit input | `RECOVERY_ONLY` | No | Full archive copy is preserved and SHA-256 `06873c141463fd38e08538388e977934cbb0d4b79917093e403180aa45b80348` verified. |

`workspace_authority.py converge` returned `DIRTY_WORK_PRESERVED`. The recovery receipt and path classification are under `/home/dev/projects/SmartSpecPro/.git/workspace-recovery/smartspecpro/workspace-63612604-a004-447e-b1c4-616de72d86b7/20261007T043322324544Z/` (`manifest.json`, `classification.json`). `workspace_authority.py verify` reports `CONVERGENCE_PENDING` with `USER_WORKSPACE_NOT_SYNCED` and `USER_WORKSPACE_DIRTY`. No reset, clean, checkout, or file removal was performed. There is no `USER_WORKSPACE_CONVERGED` receipt.

The two changes are preserved and classified, but clearing/removing the generated log delta and audit input from the registered checkout would violate the instruction not to reset or discard user workspace contents. Convergence therefore remains blocked until their owner/user selects an archival disposition that leaves the checkout clean.

After PR #163, `workspace_authority.py converge --integrated-sha a4c5c85f51205c445107e33f6929fe5649d2836b` returned `DIRTY_WORK_PRESERVED`. `verify` returned `CONVERGENCE_PENDING`, with reasons `USER_WORKSPACE_NOT_SYNCED` and `USER_WORKSPACE_DIRTY`; the resolver's current canonical SHA was `0a0b597e26ca98fb64a02189471775a580ddf0cc`. Latest recovery snapshot: `/home/dev/projects/SmartSpecPro/.git/workspace-recovery/smartspecpro/workspace-63612604-a004-447e-b1c4-616de72d86b7/20261007T052343862437Z/`. The two original paths remain unchanged.

## D. T-01 through T-23 execution

The T cases remain acceptance design, not passed acceptance. No full T scenario currently has the required Project/App identity, app-aware memory resolver, resolution receipt, transfer model, or deployment integration in runtime. The available suites below are supporting regressions and must not be relabeled as T-case passes.

| T | Class | Result | Evidence or blocking gap |
|---|---|---|---|
| T-01 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | No runtime `AppIdentity`/app-scoped context binding. |
| T-02 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | Existing project scoping is not tested with multiple Mini Apps and shared canonical identity. |
| T-03 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | Existing user/room ACL tests pass, but the Project+App membership/privacy acceptance is absent. |
| T-04 | INTEGRATION_EXECUTABLE | BLOCKED_IMPLEMENTATION | No time-segmented conversation project-binding resolver. |
| T-05 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | No verified unresolved-scope durable-write gate. |
| T-06 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | No semantic/vector project resolver with confidence/ambiguity states. |
| T-07 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | No runtime `ProjectResolutionReceipt`. |
| T-08 | INTEGRATION_EXECUTABLE | BLOCKED_IMPLEMENTATION | Promotion schema exists, but no pending-memory confirmation/promotion flow acceptance. |
| T-09 | INTEGRATION_EXECUTABLE | BLOCKED_IMPLEMENTATION | Current Chat gateway does not accept `hostAppId` for one runtime embedded in multiple apps. |
| T-10 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | No App ownership/lease/transfer flow; profile ownership tests are a different authority. |
| T-11 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | No runtime stable public App ID/install/review continuity through sale. |
| T-12 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | No effective-time asset transfer attribution integration. |
| T-13 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | No integrated infra subsidy/referral acceptance for the specified rules. |
| T-14 | EXTERNAL_RUNTIME_REQUIRED | BLOCKED_EXTERNAL | Refund contract intentionally fails closed without approved accounting/rail policy; no real reversal/settlement correction evidence. |
| T-15 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | Tenant custom-domain contract tests are adjacent; stable AppIdentity route behavior is not implemented. |
| T-16 | EXTERNAL_RUNTIME_REQUIRED | BLOCKED_EXTERNAL | Requires an actual self-hosted portable Mini App runtime and rights-scoped export. |
| T-17 | INTEGRATION_EXECUTABLE | BLOCKED_IMPLEMENTATION | No complete Chat-memory inventory/bridge/migrate/reconcile/retire path. |
| T-18 | INTEGRATION_EXECUTABLE | BLOCKED_IMPLEMENTATION | Existing nonparticipant denial test is not mid-session ACL revocation/read-write recheck. |
| T-19 | EXTERNAL_RUNTIME_REQUIRED | BLOCKED_EXTERNAL | Requires an external/portable project namespace, trust, tenant, and rights boundary. |
| T-20 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | Duplicate creator `runId` settlement test passes, but transfer/version fencing across ownership and revenue is absent. |
| T-21 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | Tenant-admin scoping tests pass; separation from legal ownership/payout events is not integrated. |
| T-22 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | No transferable App dependency/license model for third-party Skills. |
| T-23 | LOCAL_EXECUTABLE | BLOCKED_IMPLEMENTATION | No App/Asset ownership history and maintainer-role transition runtime. |

Counts for the **23 acceptance cases**: PASS 0, FAIL 0, BLOCKED 23 (15 local implementation gaps; 5 integration implementation gaps; 3 external/policy/runtime blockers), NOT_APPLICABLE 0. Direct T acceptance execution: local 0/15; integration 0/5; external 0/3 (blocked, not simulated).

Supporting local regression evidence at exact source SHA `55a0786a7359f578e0f68743a6551eaa7f588596`:

- 16 Vitest files, 112 tests passed. Scope included scoped-memory/schema helpers, existing chat memory flags/persona routing, scoped-memory authorization, team-room ACL/project propagation, economic refund/settlement/creator-revenue/skill billing, asset/product identity contracts, and workspace-authority audit/read-model behavior.
- `python3 -m unittest skills.development-lifecycle.tests.test_git_capabilities`: 21 tests run, 20 passed, 1 skipped by the suite.
- `python3 -m tools.spec_handoff validate --all`: PASS, 467 dynamic records and 310 canonical Specs; no missing handoffs, invalid manifests, or generated status drift.
- `python3 -m tools.spec_handoff index --check`: PASS at the test source, no drift.
- Working branch after SPEC-268 recovery: `validate --all` PASS, 468 records / 311 canonical Specs; `index --check` PASS with no drift. `git diff --check` passes for task changes excluding the two recovered R2.5 markdown source files; those preserve original Markdown hard-break trailing spaces, while the R2.6 amendment itself is clean. Scoped secret scan found 0 findings across changed paths.
- These are focused local tests, not a DB-backed integration/UAT suite or external/production test. No test failure was observed.

## E. Project/memory context acceptance

All 12 requested context cases remain blocked as full acceptance. Cases 1–10 and 12 are blocked by the missing resolver/identity/runtime bindings or by lack of a direct cross-project isolation acceptance; existing scope/ACL subtests do not prove the new app/project scope lattice. Case 11 is `BLOCKED_EXTERNAL`: a true portable runtime outside SmartAIHub is unavailable. Current code includes legacy `projectId`, `memoryMode`, and `personaId` paths, but the acceptance does not make those the permanent authority.

## F. Cross-Spec authority and dependency result

| Spec | Authority owned | Main contracts consumed/produced | No-overlap boundary | Implementation / migration dependency |
|---|---|---|---|---|
| 166 | Credit event lineage | Existing credit transactions; consumed by 280/303 | No second ledger | Add lineage dimensions and reconcile existing rows only. |
| 233 | LivingProject intelligence/evolution | Consumes 302 project identity | Not project identity, ACL, or lifecycle | Bind current projections; no table replacement. |
| 263 | Public site/Discover experience | Consumes 303 listings and 304 app routes | Not identity/ownership/deployment | Route and redirect migration remains with its contract. |
| 266 | Evidence/knowledge semantics and provenance | Consumed by 269/284; portable runtime is 281 | Not memory authority | Preserve source IDs/rights; no evidence migration asserted. |
| 268 | Memory scope/storage/recall/retention/forget authority | Consumed by 269/302/304 | Not Project identity, assistant runtime, Work Context, or portable knowledge | R2.5 recovered; R2.6 runtime integration and ACL/migration evidence remain open. |
| 269 | Assistant/team/delegation behavior | Consumes 268 R2.6, 302, 266; uses existing Chat | No second Chat backend or memory store | Runtime bindings and direct acceptance remain open; source dependency is recovered. |
| 280 | Capability commerce/revenue attribution | Consumes 166 and 207 settlement | Not asset legal ownership or settlement ledger | Continue existing billing; no new ledger. |
| 284 | Evidence retrieval/artifact continuity | Consumes 302 identity and 266 evidence | Not project identity or evidence source SoT | Map legacy project IDs with ACL-preserving migration. |
| 287 | UI governance/rendering contract | Consumes 302/304 context and surfaces | Not project/app identity | UI primitives remain downstream consumers. |
| 292 | WorkContext/collaboration projection | Consumes 302 identity | Not Project SoT or memory authority | Bind projection to canonical project; preserve collaboration data. |
| 295 | Production release/deploy/migration/health/rollback | Consumes 304 stable App identity and runtime requirements | Not App identity/routing | 295 owns all production migrations; none executed here. |
| 302 | Canonical Project identity/bindings/context resolution | Maps domain IDs; coordinates 268 scope | Not domain lifecycle, LivingProject, WorkContext, or memory | Inventory, expand/contract bindings, backfill, reconcile, rollback. |
| 303 | Asset identity, ownership, rights, transfer, distribution | Consumes 302/304 identity and 166/280/207 economics | Not credit/settlement ledger or deployment executor | Rights inventory and additive party/asset bindings before backfill. |
| 304 | Stable App identity/routing/app context | Consumes 302, 268, 269, package/resource contracts; supplies App ID to 295 | Not ownership transfer or release/deployment lifecycle | Additive identity/alias mapping; 295 gates deployment/migration. |

Repository scan found no duplicate canonical authority for 302–304. All referenced Spec IDs in 269/302/303/304 now resolve in repository history, including recovered SPEC-268 R2.5 and its R2.6 amendment. The explicit architecture has two **bounded interface-reference cycles**, not duplicate ownership: SPEC-303 ↔ SPEC-304 (Asset ownership references stable App ID; App may be an Asset) and SPEC-304 ↔ SPEC-295 (App ID is a release target; routing consumes deployment state). Sequence identity creation first, then asset/deployment bindings; preserve the ownership boundaries in the table. Runtime memory acceptance remains incomplete.

## G. Independent completion states and next workunit

```text
SPEC_268_DISPOSITION = RECOVERED_AUTHORITATIVE_R2_5; additive R2.6 integrated at a4c5c85f
SPEC_302_AUTHORITY = REPOSITORY_ID_AUTHORITY_VALID
SPEC_303_AUTHORITY = REPOSITORY_ID_AUTHORITY_VALID
SPEC_304_AUTHORITY = REPOSITORY_ID_AUTHORITY_VALID
EXTERNAL_SPEC_LIBRARY_COLLISION_CHECK = NOT_VERIFIED
WORKSPACE_OWNER_STATE = NONE / NO_ACTIVE_SESSION / task_id=null
CANONICAL_USER_WORKSPACE_CONVERGED = FALSE
T01_T23_LOCAL_EXECUTED = 0/15 direct cases (112 supporting tests passed on 55a0786; stale against current main)
T01_T23_INTEGRATION_EXECUTED = 0/5 direct cases
T01_T23_EXTERNAL_BLOCKED = 3 (T-14, T-16, T-19)
PROJECT_MEMORY_CONTEXT_ACCEPTANCE = 0/12 direct cases (11 local implementation blockers, 1 external runtime blocker)
CROSS_SPEC_AUTHORITY_VALIDATION = REPOSITORY_REFERENCE_AND_BOUNDARIES_VALID; runtime acceptance pending
HANDOFF_UPDATED = TRUE; integration SHA refresh to a4c5c85f is in this follow-up

SPEC_AUTHORITY_COMPLETENESS = COMPLETE_REPOSITORY_SCOPE (SPEC-268 source recovered; 302–304 repository ID authority valid; external library status separate)
DOCUMENTATION_COMPLETENESS = COMPLETE (R2.5 provenance, R2.6 amendment, T matrix, authority report, and shared Handoffs integrated at PR #163)
LOCAL_RUNTIME_VALIDATION = PARTIAL_STALE_EVIDENCE (112 Vitest + 20 Python tests passed on 55a0786; direct T cases remain blocked)
EXTERNAL_RUNTIME_VALIDATION = BLOCKED_EXTERNAL (T-14, T-16, T-19; no external/production evidence)
WORKSPACE_CONVERGENCE = BLOCKED_DIRTY_WORK_PRESERVED (latest resolver attempt preserved both paths)
```

Next workunit: **`SMARTHUB-AUTHORITY-RECOVERY-UAT-CLOSURE`**. Integrate this exact-SHA Handoff refresh. Then implement and run direct T-01–T-23 runtime acceptance; handle external gates separately. Workspace convergence still requires a safe disposition for the generated debug-log delta and audit ZIP; both are preserved and no destructive action is authorized.
