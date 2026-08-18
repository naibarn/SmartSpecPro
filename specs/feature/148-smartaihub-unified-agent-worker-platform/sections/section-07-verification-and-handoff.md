# Section 07 — Verification and Handoff

## Goal

Verify the implementation against Feature 148 without confusing focused proof
with full-repository, live provider, or real-machine evidence.

## Ownership

Run focused tests/typechecks/smoke checks, inspect migrations and diffs, update
section documentation with actual paths/results, and produce the final gate
report. Do not change unrelated dirty-worktree files.

## Verification matrix

1. Run focused Vitest suites for MCP OAuth/metadata/protocol, onboarding,
   Connected Devices, scheduler/relay, Comfy contracts, and worker artifact
   paths.
2. Run web typecheck for touched TypeScript and Worker App Cargo/typecheck for
   touched Rust/runtime code.
3. Run `npm run mcp:smoke`, `npm run mcp:readiness`, and failure harness with
   safe test configuration when available.
4. Run migration checker and inspect live Drizzle journal before accepting any
   schema change. Verify actual tables/types/hashes; do not trust a printed
   migration-success message alone.
5. Run focused browser evidence for Settings/client onboarding and task/device
   status. If browser/provider/worker is unavailable, record the exact blocker.
6. Run `git diff --check` and inspect explicit changed paths. Preserve all
   unrelated modified files and do not use destructive cleanup.

## Gate report

Report separately:

- implemented source changes;
- focused unit/integration/typecheck proof;
- browser evidence;
- known repository-wide baseline failures;
- unavailable live/provider/Windows/macOS evidence;
- remaining gates: signed packs, macOS Remotion sidecar, real Comfy image/video,
  model/custom-node/GPU compatibility, production telemetry cohort, and 30–90
  day legacy deprecation observation.

## Tests-first requirements

- Add a final flags-off compatibility regression.
- Add descriptor-to-doc/UI consistency regression.
- Add no-secret/no-arbitrary-command static guards.
- Add acceptance checklist output with pass/blocked/not-run states.

## Acceptance

The section is complete only when focused proof is recorded and every remaining
external gate has an owner, evidence requirement, and truthful user-visible
blocked state. It must not mark Feature 148 fully production-ready solely from
mock tests or builds.

## UI/UX Contract

### Target User / JTBD

N/A for a verification-only section; it validates the user-facing evidence
produced by earlier sections.

### Surface Inventory

Settings, docs, task status, runtime readiness, and final gate report.

### Component Map

N/A; no new production component is owned here.

### State Matrix

Pass, blocked, not run, baseline failure, and external evidence pending.

### Responsive Matrix

N/A for command/report verification; browser evidence follows owning section.

### Accessibility Acceptance

Gate reports and status surfaces must use explicit text and not rely on color.

### Copy Contract

Use concise Thai/English pass/blocked/not-run wording and identify the exact
next evidence or remediation step.

### Browser Evidence Required

Collect or explicitly mark missing browser evidence for onboarding, revoke,
task recovery, and runtime blocker flows.

## Implementation status

Focused implementation verification is complete for the committed working-tree
slice; the exact commands and results are recorded in
`implementation/implementation-report.md`. No real production OAuth login,
third-party CLI session, Comfy model/GPU render, or signed desktop release was
claimed from fixture/unit tests.
