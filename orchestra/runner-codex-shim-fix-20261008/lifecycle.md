# Orchestra Lifecycle

Goal: Use the attached Runner diagnostics to repair Windows Codex discovery and verify the shim selection.
Scope/risk: small/medium
Current stage: FINAL_VERIFY
Resume from: FINAL_VERIFY
Stop reason: awaiting Windows hosted proof and canonical promotion
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
    status: COMPLETE
    entry_evidence: focused Runner discovery tests
    exit_evidence: 164 crate tests pass; `cargo fmt --check` and `git diff --check` pass
    attempt: 1
    stale: false
    next_action: await Windows workflow result
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
