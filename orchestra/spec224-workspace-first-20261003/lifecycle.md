# Orchestra Lifecycle

Goal: Make Spec 224 usable from Chat in an explicit selected Runner workspace, with prompt and evolving multi-file Spec Set inputs and scoped independent work-package readiness.
Scope/risk: large/high
Current stage: VERIFY
Resume from: IMPLEMENT
Stop reason: implementation_and_verification_incomplete
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
- Planning: COMPLETE — Revision 21 and source audit/gap matrix.
- TDD/Test Design: COMPLETE for workspace binding, intake, incremental compiler, input staging and Start; build/test/run remain outside this action path by user intent (see test-design.md).
- Implement: PARTIAL — workspace/SpecSet intake, incremental work-package readiness, Markdown package declarations, staged inputs/retention, explicit Start and shared-workspace status projection are implemented. Approved candidate isolation is still absent.
- Verify: PARTIAL — focused backend tests pass (43/43 in recent focused batch); Runner Rust suite passes (97/97); broad Spec224 batch has 3 failures in untouched baseline tests and an integration suite that cannot load without `JWT_SECRET`; migration/database/live Runner remain unverified.
- Debug/Fix: PARTIAL — bounded retention reconciliation and FK retention semantics corrected; no new focused regression remains.
- Review: PARTIAL — code paths reviewed for source retention and Runner workspace mutation; remaining P0 is architectural, not a safe local patch.
- Final Verify: BLOCKED — no approved isolated provider runtime, source fingerprint/CAS, or enforced write-set boundary is present.

Gap ledger:
- GAP-1: Conversation-to-workspace binding/shared identity — implemented; focused service/router/UI tests pass. Live migration and DB proof pending — VERIFY_ONLY.
- GAP-2: Multi-file immutable SpecSet and safe ZIP intake — implemented with focused tests; live migration pending — VERIFY_ONLY.
- GAP-3: Multi-artifact compiler, incremental readiness and impact — implemented with focused compiler/service tests; completeness still bounded by supported requirement schema — REVIEW/VERIFY.
- GAP-4: Explicit server-derived Start — implemented and leaves canonical run pending authorization; admission `workPackageId` now persists top-level through projection/manifest (prompt uses synthetic `prompt`) — VERIFY authorization/reconnect through a live Runner.
- GAP-5: Prompt/Spec input staging — implemented with lease/session/fence-bound grant and Runner digest/path checks; `runnerControl.test.ts` loads and 21/22 tests pass, but it has no direct staged-input endpoint coverage and the credential-refresh test fails with 503 — VERIFY.
- GAP-6: Build/test/application-run actions — intentionally remain separate user-owned actions and are not implied by Chat prompt/Spec run; no platform action API/receipt is in this slice. Confirmed as outside this requested ownership boundary, not claimed implemented.
- GAP-7: Full verifier — deliberately fail-closed as `FULL_VERIFICATION_RUNTIME_NOT_CONFIGURED` — MUST_FIX before full readiness.
- GAP-8: Workspace content freshness — gitHead and snapshotRevision are captured, but dirty working-tree content is not fingerprinted or revalidated at dispatch — MUST_FIX before run can claim exact source pinning.
- GAP-9: Work-package write-set is compiled and described to the agent, but not enforced by Runner isolation/change guard — MUST_FIX before claiming preservation of out-of-scope files.
- GAP-10: Pre-staged source retention/orphan cleanup — worker-job binding/reconciliation, 24h orphan grace, 30d terminal retention, bounded cleanup and canonical scheduler added — IMPLEMENTED_WITH_FOCUSED_PROOF; DB migration/runtime schedule still unverified.
- GAP-11: Markdown-only package execution — one bounded `spec224-work-packages` JSON fence is parsed and documented; malformed/multiple declarations fail closed — IMPLEMENTED_WITH_FOCUSED_PROOF.
- GAP-12: Live Runner/provider, applied migration and deployment certification — external-state VERIFY_ONLY; no readiness claim.
- GAP-13: Review P1s (workspace facts type, prepare mutation, JSONB size margin, same-key replay, stale preview pinning and package input closure) — addressed in source; backend focused tests pass — IMPLEMENTED_WITH_FOCUSED_PROOF.

Completion invariants:
- all_mandatory_stages_closed: false
- no_open_must_do_gap: false
- no_stale_required_gate: false
- review_converged: false
- final_verify_fresh: false
