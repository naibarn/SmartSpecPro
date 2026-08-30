# Orchestra Plan

task: Diagnose and repair Vertical Drama characters whose Character DNA is absent, including the real persisted data and the prompt-generation failure path.
language: Thai
intent_signals: bug report; asks for root cause from real data; asks to fix and prevent recurrence end-to-end.
activation: direct orchestra ownership from a cross-layer debugging and implementation request.
bug_route: true
scope: large
risk: high
route: direct-inline-waves (standard light mode; no sub-agent tool available)
dispatch_preference: inline-standard-light
socraticode: unavailable in this session; shell discovery fallback recorded.

Evidence ledger:
  source: local DB + audit log + code
  identifier: series 57, tenant-ZCSKEM9s, characters 204-208
  observed failure: rows 206-208 have no canonical DNA; first-casting prompt path can reject them when age cannot be inferred.
  data state: confirmed — 5 roster rows; DNA/assets/tasks exist only for 204-205; no task/error for 206-208.
  confidence: high
  root cause: roster seeding intentionally writes description-only rows; candidate-first UI path required castingAgeProfile and threw for adult-looking rows without explicit age; needsSetup also incorrectly treated description as DNA.
  repair: authoritative DNA detection uses validated visualBible.designDna; candidate path falls through to single prompt generation when no safe age profile exists.

Work waves:
  1. Locate authoritative Character DNA contract, readers, writers, and runtime data access; inspect real series 57 records if available. [completed]
  2. Reproduce with a focused failing test or data fixture; identify the exact invariant breach and repair scope. [completed]
  3. Implement the smallest safe repair, durable backfill/recovery if required, and prevention at the write/API boundary. [completed]
  4. Run focused tests/type checks and review the changed path; record residual production/browser verification limits. [completed with baseline typecheck failures]

Scope boundary: preserve unrelated dirty worktree changes; do not deploy or mutate production data without an explicit, safe runtime path and evidence.

## Current Task: Repository Reconciliation and Main Publication

- intent: inspect all current Git changes, commit eligible source/config/spec/doc/test changes, and publish `main` so `HEAD` matches `origin/main`.
- scope: large; risk: medium (GitHub main publication and workflow/config changes).
- route: direct-inline-waves (standard light mode; no sub-agents available).
- socraticode: unavailable; shell-based full status/diff inventory used.
- inventory: 917 tracked paths changed; 2,396 untracked files initially, including approximately 22.5 GB of generated cache/build/release payloads.
- boundary: retain source/config/spec/doc/test/UI evidence files; ignore generated `.tmp-codex*`, `dist-staging-*`, release payloads, root Drizzle output, and skill reports. Do not stage the unexplained zero-byte root file `=.*new`.
- publication gate: verify `git diff --check`, targeted secret-pattern review, staged file-size limits, commit success, push success, and local/remote SHA parity.
