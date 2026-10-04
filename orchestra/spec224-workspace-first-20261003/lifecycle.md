# Orchestra Lifecycle

Goal: Make Spec 224 usable from Chat in an explicit selected Runner workspace, with prompt and evolving multi-file Spec Set inputs and scoped independent work-package readiness.
Scope/risk: large/high
Current stage: VERIFY
Resume from: VERIFY
Stop reason: live_runner_provider_smoke_and_dev_integration_pending
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
- Planning: COMPLETE — Revision 21 and source audit/gap matrix.
- TDD/Test Design: COMPLETE for workspace binding, intake, incremental compiler, input staging and Start; build/test/run remain outside this action path by user intent (see test-design.md).
- Implement: COMPLETE — workspace/SpecSet intake, incremental package readiness, staged inputs/retention, explicit Start, shared-workspace status projection, source fingerprinting, private candidate execution, allowed-write-set enforcement, per-path CAS and journaled rollback are implemented in the source branch.
- Verify: PARTIAL — focused source tests passed (Runner Rust 104/104; scoped Web 54/54). Dev database `smartspec` applied migrations 0382–0386 on 2026-10-04. Live Runner/provider smoke, integrated Chat workflow, full Final Verify and deployment remain unverified.
- Debug/Fix: COMPLETE for the source implementation — candidate isolation and workspace freshness/write-set gaps below were addressed in source; no new source regression was reported by the scoped tests. Live runtime gaps remain under Verify.
- Review: PARTIAL — the prior source review is recorded; final review against an integrated dev runtime remains pending.
- Final Verify: BLOCKED — the current dev web service still runs `main` (`bd61133`), not the Spec 224 source branch, and no live Runner/provider result is recorded.

Gap ledger:
- GAP-1: Conversation-to-workspace binding/shared identity — implemented; focused service/router/UI tests pass. Dev DB migration 0383 is applied; integrated runtime proof remains — VERIFY_ONLY.
- GAP-2: Multi-file immutable SpecSet and safe ZIP intake — implemented with focused tests; dev DB migration 0383 is applied; integrated runtime proof remains — VERIFY_ONLY.
- GAP-3: Multi-artifact compiler, incremental readiness and impact — implemented with focused compiler/service tests; completeness still bounded by supported requirement schema — REVIEW/VERIFY.
- GAP-4: Explicit server-derived Start — implemented and leaves canonical run pending authorization; admission `workPackageId` now persists top-level through projection/manifest (prompt uses synthetic `prompt`) — VERIFY authorization/reconnect through a live Runner.
- GAP-5: Prompt/Spec input staging — implemented with lease/session/fence-bound grants and Runner digest/path checks; focused contract tests pass. Live authenticated Runner delivery remains unverified — VERIFY_ONLY.
- GAP-6: Build/test/application-run actions — intentionally remain separate user-owned actions and are not implied by Chat prompt/Spec run; no platform action API/receipt is in this slice. Confirmed as outside this requested ownership boundary, not claimed implemented.
- GAP-7: Full verifier — deliberately fail-closed as `FULL_VERIFICATION_RUNTIME_NOT_CONFIGURED`; package-level source proof remains distinct from whole-project Final Verify — VERIFY_ONLY before full certification.
- GAP-8: Workspace content freshness — deterministic fingerprint covers tracked and non-ignored untracked source; Start pins it and candidate apply revalidates per-path CAS — IMPLEMENTED_WITH_FOCUSED_PROOF; live Runner proof pending.
- GAP-9: Work-package write-set — enforced against the complete candidate delta before apply, including symlink/path escape checks — IMPLEMENTED_WITH_FOCUSED_PROOF; live Runner proof pending.
- GAP-10: Pre-staged source retention/orphan cleanup — worker-job binding/reconciliation, 24h orphan grace, 30d terminal retention, bounded cleanup and canonical scheduler added — IMPLEMENTED_WITH_FOCUSED_PROOF; migrations 0385–0386 applied to dev DB.
- GAP-11: Markdown-only package execution — one bounded `spec224-work-packages` JSON fence is parsed and documented; malformed/multiple declarations fail closed — IMPLEMENTED_WITH_FOCUSED_PROOF.
- GAP-12: Live Runner/provider and integrated dev workflow — migration 0382–0386 is applied; current web runtime is still `main` and live Runner/provider proof is pending — VERIFY_ONLY; no end-to-end readiness claim.
- GAP-13: Review P1s (workspace facts type, prepare mutation, JSONB size margin, same-key replay, stale preview pinning and package input closure) — addressed in source; backend focused tests pass — IMPLEMENTED_WITH_FOCUSED_PROOF.

Completion invariants:
- all_mandatory_stages_closed: false
- no_open_must_do_gap: true
- no_stale_required_gate: false
- review_converged: false
- final_verify_fresh: false
