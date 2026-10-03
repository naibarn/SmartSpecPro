# Orchestra Lifecycle — Spec 263 / 270 Website Continuation

Goal: make the public SmartAIHub website usable through repository-owned, truthful, verified work.

Scope/risk: large/high
Current stage: FINAL_VERIFY
Resume from: FINAL_VERIFY
Stop reason: scoped public website continuation verified; full spec acceptance remains externally blocked
Mandatory stages for this scoped continuation: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
- stage: PLANNING
  status: CLOSED
  entry_evidence: approved Spec 263/270 plans and task-local scope reconciliation
  exit_evidence: source audit kept changes to existing public routes; root orchestra progress preserved
  attempt: 1
  stale: false
  next_action: none
- stage: TDD_DESIGN
  status: CLOSED
  entry_evidence: task-local `test-design.md`
  exit_evidence: locale/copy/SEO/prerender/route guard coverage added
  attempt: 1
  stale: false
  next_action: none
- stage: IMPLEMENT
  status: CLOSED
  entry_evidence: public Home, shared metadata, signup and shell source changes
  exit_evidence: targeted diffs reviewed; invitation-mode review gap fixed
  attempt: 1
  stale: false
  next_action: none
- stage: VERIFY
  status: CLOSED
  entry_evidence: focused Vitest suites and local Vite source smoke
  exit_evidence: 7 focused files / 25 tests passed; EN/TH Home and signup fail-closed copy checked at 390px
  attempt: 2
  stale: false
  next_action: none
- stage: DEBUG_FIX
  status: CLOSED
  entry_evidence: first review and browser checks
  exit_evidence: invite-only dynamic policy corrected; config error no longer mislabels registration; Helmet duplicate metadata corrected; repeat focused suite passed
  attempt: 2
  stale: false
  next_action: none
- stage: REVIEW
  status: CLOSED
  entry_evidence: independent read-only public-route review and follow-up signup/CTA review
  exit_evidence: one P2 runtime-policy finding fixed; no remaining in-scope P1/P2 findings reported
  attempt: 2
  stale: false
  next_action: none
- stage: FINAL_VERIFY
  status: CLOSED_WITH_DEFERRED_GATES
  entry_evidence: final focused suite, responsive source browser smoke, git diff review
  exit_evidence: user requested no build; no build or production claim made; remaining spec/production gates recorded in `audit-rounds.md`
  attempt: 1
  stale: false
  next_action: report scoped completion and residual Spec 263/270 blockers

Gap ledger:
- gap_id: build_and_deployment_proof
  status: deferred_by_user_instruction
  owner: user-requested no-build boundary
- gap_id: production_backend_signup_proof
  status: external
  evidence: Vite development server had no API backend; fail-closed behavior checked only
- gap_id: spec263_external_artifact_claims_film_proof
  status: blocked_external_owner_evidence
- gap_id: spec270_durable_artifact_and_live_authorities
  status: blocked_external_owner_evidence

Completion invariants:
  scoped_public_path_locally_verified: true
  all_spec_263_270_acceptance_closed: false
  no_open_in_scope_must_do_gap: true
  no_stale_required_gate: true
  review_converged: true
  final_verify_fresh: true
