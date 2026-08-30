# Section 06 — Integration, migration, rollout, and final audit

## Goal

Close cross-section gaps, validate the full lifecycle, add flags/observability,
and document runtime evidence boundaries.

## Files

- Add integration tests across web/shared/Worker where existing harness allows.
- Add feature flags and migration dry-run/invariant checks using existing
  conventions; preserve unrelated changes.
- Update section documentation with actual paths, test counts, deviations,
  and review findings.

## Required behavior

Exercise pair → Series list → select → bind → Media Workspace → local work →
derived publication/index → queue/published view → revoke → restart/recovery.
Cover offline, hidden Series, old token/route, duplicate actions, stale
revisions, missing GPU/MCP, crash, remote reconciliation, and rollback.

Flags independently disable shell, control plane/access migration, binding,
Media Workspace, Quick Actions, automated AI, and derived publication. Rollback
stops new authority-sensitive work and preserves source/artifacts/history.
Metrics/audit redact raw paths, names, fingerprints, tokens and provider data.

## Verification

Run focused Vitest suites, Worker typecheck/build/tests, Rust tests, section
checker/UI contract checker, `git diff --check`, and targeted semantic audits.
Separate browser/native/GPU/MCP/provider/migration/deployment proof from local
test evidence.

## Acceptance

No MUST_FIX remains after cross-section review; legacy behavior is preserved;
all documented gaps are either fixed or explicitly environment-gated with an
actionable proof command.

## UI/UX Contract

### Target User / JTBD
N/A — integration/release gate for the shell and Media Workspace.
### Surface Inventory
N/A — verifies sections 04 and 05.
### Component Map
N/A — cross-section integration ownership.
### State Matrix
Integration covers success, blocked, stale, offline, revoked, recovery, and rollback.
### Responsive Matrix
N/A — visual proof is owned by UI sections.
### Accessibility Acceptance
No rollout until shell and Media Workspace accessibility checks pass.
### Copy Contract
No new copy; verify localized stable error mapping.
### Browser Evidence Required
Browser/native evidence checklist plus explicit live runtime evidence status.
