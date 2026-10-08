# Orchestra Lifecycle

Goal: Use the attached Runner diagnostics to repair Windows Codex discovery and verify the shim selection.
Scope/risk: small/medium
Current stage: FINAL_VERIFY
Resume from: FINAL_VERIFY
Stop reason: Windows run exposed a test-only cfg import gap; fix applied and hosted proof must be rerun
Mandatory stages: PLANNING, TDD_DESIGN, IMPLEMENT, VERIFY, DEBUG_FIX, REVIEW, FINAL_VERIFY

Stage ledger:
  - stage: PLANNING
    status: COMPLETE
    entry_evidence: attached `runner-debug-1791444194817.json`
    exit_evidence: plan.md evidence ledger identifies extensionless npm alias selected before `.cmd`
    attempt: 1
    stale: false
    next_action: none
  - stage: TDD_DESIGN
    status: COMPLETE
    entry_evidence: test-design.md
    exit_evidence: prior ordering assertion failed as expected before code change
    attempt: 1
    stale: false
    next_action: none
  - stage: IMPLEMENT
    status: COMPLETE
    entry_evidence: `apps/runner-app/src/discovery.rs`
    exit_evidence: `.exe`, `.cmd`, `.ps1`, `.bat`, then extensionless on Windows; Unix ordering retained
    attempt: 1
    stale: false
    next_action: none
  - stage: VERIFY
    status: IN_PROGRESS
    entry_evidence: focused Runner discovery tests
    exit_evidence: 164 crate tests and formatting passed on Linux; first Windows-hosted run found E0432 from Linux-only test imports
    attempt: 1
    stale: true
    next_action: rerun Rust crate suite locally and Windows hosted workflow after cfg import repair
  - stage: DEBUG_FIX
    status: COMPLETE
    entry_evidence: expected RED ordering failure
    exit_evidence: launchable Windows shim precedence implemented; no further local gap found
    attempt: 1
    stale: false
    next_action: none
  - stage: REVIEW
    status: COMPLETE
    entry_evidence: targeted diff review
    exit_evidence: change is confined to Windows executable candidate ordering and a platform-injected test seam; Unix behavior unchanged
    attempt: 1
    stale: false
    next_action: none
  - stage: FINAL_VERIFY
    status: IN_PROGRESS
    entry_evidence: full Rust crate suite and formatting check
    exit_evidence: pending Windows-hosted workflow and normal PR integration
    attempt: 1
    stale: true
    next_action: dispatch Windows hosted Runner workflow with publish disabled, then merge after gates

Gap ledger:
  - gap_id: GAP-1
    discovered_at_stage: PLANNING
    earliest_affected_stage: FINAL_VERIFY
    classification: VERIFY_ONLY
    severity: MEDIUM
    condition: selected shim must launch in actual Windows process environment
    evidence: attached report identifies Windows and `probe_launch_failed`; Linux seam plus local tests do not prove Windows CreateProcess
    owner: conductor
    action: run `runner-release.yml` for the candidate ref with Windows target, local_device profile, unsigned-review signing, and publish=false
    attempts: 0/3
    stale_gates: [final_verify]
    status: OPEN
    resume_from: FINAL_VERIFY
    residual_risk: actual user's Windows install and Codex task smoke test remain pending
    root_cause: extensionless npm alias was ranked ahead of `codex.cmd`
    decision_class: VERIFY_NOW
    attempted_strategies: [linux-hosted unit seam proves candidate ordering]
    prohibited_retries: []
    waiting_predicate: Windows workflow completes for the candidate commit
    reactivation_predicate: workflow completion or failure
    progress_delta: root cause reproduced and candidate ordering fixed
  - gap_id: GAP-2
    discovered_at_stage: VERIFY
    earliest_affected_stage: IMPLEMENT
    classification: MUST_FIX
    severity: MEDIUM
    condition: Windows `cargo test` cannot compile because a shared test module imports Linux-gated symbols unconditionally
    evidence: GitHub Actions run 37743535996, Windows `Test Runner crate`, compiler E0432 at `apps/runner-app/src/diagnostics.rs:2619`
    owner: conductor
    action: cfg-gate Linux-only test imports and re-run the same Windows workflow
    attempts: 1/3
    stale_gates: [verify, debug_fix, review, final_verify]
    status: FIXED
    resume_from: VERIFY
    residual_risk: Windows proof remains pending
    root_cause: test module imports `build_local_session_inventories` and `MAX_SAFE_JS_INTEGER`, which exist only on Linux
    decision_class: FIX_NOW
    attempted_strategies: [examined exact hosted compiler log; gated imports to match production definitions]
    prohibited_retries: [rerun unchanged Windows workflow]
    waiting_predicate: none
    reactivation_predicate: Windows workflow re-run completes
    progress_delta: Windows test compile blocker removed without changing production behavior
