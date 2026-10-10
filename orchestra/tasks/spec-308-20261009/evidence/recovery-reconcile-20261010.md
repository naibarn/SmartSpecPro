# SPEC-308 recovery and reconciliation — 2026-10-10

## Observed canonical and PR state

- Fetched `origin/main`: `b1f2d52e5ba864685dc28414c6f49d7ffe9523eb`. The supplied `2b497268f5a5c76c45d277cb162f59d10137f97d` and `e7d437b86ce9c385e15416cef3d1b5b47df3759b` are historical PR base/head references; they are not the current canonical tip.
- PR #399 remains OPEN, non-draft, head `e7d437b86ce9c385e15416cef3d1b5b47df3759b`, base `2b497268f5a5c76c45d277cb162f59d10137f97d`; GitHub reports `DIRTY` merge state. No merge SHA exists.
- PR #403 remains OPEN and Draft, head `74a482e8fe38a131bdbe41bfee0e53ad90347e4c`. It already owns the MCP protocol fixture repair: it replaces DB-backed protocol test state with a mocked persistence fixture, removes obsolete `importActual` DB initialization, and restores explicit nullable context defaults. Do not duplicate this work.
- PR #405 remains OPEN and Draft, head `868a5600ff770be91885666b7f584835e03fc690`. Its recorded dependency audit still has one Moderate `sprintf-js@1.1.3` finding through the ONNX runtime chain. Full production audit is mandatory; no suppressions, downgrade, or risk acceptance were applied. The compatible ONNX/WSL2 route or scoped risk disposition requires Security and Media/Runtime owner authority.
- No PR or commit was merged for this outcome. The local primary checkout has unrelated dirty changes and was left untouched. Existing SPEC-308, MCP and security task worktrees inspected for this recovery were clean; no reset, rebase, or cleanup was run on another worktree.

## Exact evidence on historical SPEC-308 head

- Browser run [38014076887](https://github.com/naibarn/SmartSpecPro/actions/runs/38014076887) passed on `e7d437b86ce9c385e15416cef3d1b5b47df3759b`. This is a mocked UI browser simulation, not live authenticated acceptance.
- MCP run [38014076965](https://github.com/naibarn/SmartSpecPro/actions/runs/38014076965) failed on the same head. The focused suite reported 44 failures / 76 passes; audit and related downstream steps did not execute. The live smoke failed closed because the authorized endpoint and token were absent.
- The MCP failure is new relative to PR #403's earlier 118/118 focused pass and must be reconciled on current main after the security dependency decision. Existing PR #403 fixture work is not presumed to fix all current-head drift.
- The canonical SPEC-308 ledger remains 66/66 unresolved. No integration SHA, authenticated acceptance, or production authorization is recorded.

## Reconciled WorkUnits and next actions

1. `WP_SECURITY_BASELINE_DEPENDENCY_REMEDIATION` — producer is PR #405. Refresh against current canonical after authorized Security + Media/Runtime decision, then run exact-head mandatory audit and ONNX/WSL2 compatibility evidence if that route is selected. Keep OPEN/Draft until policy-required gates pass.
2. PR #403 MCP security gate — reuse existing fixture repair; reconcile the observed 44/76 failure against current main, avoid retired-service restoration, run focused tests/security gate and mandatory audit only after dependency/security prerequisites pass.
3. MCP live authority — CI/runtime owner must provide approved non-production endpoint and token through GitHub secret management; rerun live protocol gate. No secret was inspected.
4. SPEC-308 authenticated browser acceptance — runtime/Feature-049 owners must provide isolated non-production app, persistent authorized identity and tenant-scoped notification revision/authorization evidence. Keep notification attention static until that authority is proven.
5. PR #399 current-head browser verification — after security/MCP dependencies and reconciliation, refresh PR on current `origin/main`, resolve merge conflicts semantically in an isolated owned worktree, then run one exact-head unit/Chromium suite. Keep all 66 ledger rows open absent criterion-level evidence.
6. Canonicalization — regenerate/validate the SPEC handoff through `tools.spec_handoff`, record integration SHA only after normal protected integration, and tie post-merge verification to that exact SHA.

## Completion state

`VALIDATION_PENDING` / `CONTINUE_REQUIRED`. Safe progress is the exact browser PASS and this evidence reconciliation. Merge, live acceptance, production flags, and completion remain unclaimed.
