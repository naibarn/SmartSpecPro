# Section 10 — Cross-section integration and acceptance proof

## Scope and dependencies

This section runs after Sections 01–09 and owns integration wiring, evidence manifests and residual-risk reporting. It does not replace unit, browser, Rust, migration or deployment proof.

## Tests first

- Add an authenticated integration/E2E flow: Web create/import/edit/save/reload → revision-pinned submit → existing queue claim/lease → Worker artifact upload/verification → Library → reopen.
- Exercise two-tab/offline conflict, proxy/VFR timing, no worker/capability, cancellation, retry/duplicate delivery, stale callback/result, R2 timeout, low disk, corrupt output, replay, cross-tenant/path/URL/overlay denial, billing and notification dedupe.
- Assert `/worker-jobs` canonical route, `/render-jobs` query-preserving alias, Thai/English copy, responsive/a11y evidence and rollback.

## Implementation and evidence

Wire exports/imports and route registration identified by previous sections; fix interface mismatches before finalizing. Maintain `implementation/evidence/feature-184-manifest.md` with commit/fixture IDs, exact commands, timestamps, environment, pass/fail/blocked status, and links to screenshots/logs. Run focused Vitest/jsdom, full Web typecheck/build, Playwright, Rust Cargo/packaging, migration dry run, real FFmpeg/Remotion smoke and deployment checks independently. Missing runtime or credentials is recorded as BLOCKED/SKIPPED, never PASS.

## Acceptance and rollback

Map AC-01–AC-18 one-to-one to evidence rows. A section is complete only when its code/tests/docs are present and unresolved MUST_FIX gaps are zero. If integration fails, keep feature flags off, preserve old queue/editor behavior, and record the smallest follow-up rather than mutating unrelated work.

## UI/UX Contract
### Target User / JTBD
Reviewer needs reproducible evidence that the creator flow works across supported surfaces.
### Surface Inventory
Editor, Worker Jobs, Library, notifications, diagnostics, and rollback controls.
### Component Map
Integration harness drives browser; server/Worker logs and evidence manifest provide proof.
### State Matrix
Happy path plus all blocked, failed, stale, canceled, recovery, and rollback states.
### Responsive Matrix
Evidence includes mobile, tablet, laptop, and desktop viewport runs.
### Accessibility Acceptance
All browser acceptance rows include keyboard/focus/announcement assertions.
### Copy Contract
Evidence records Thai/English labels and stable errors without leaking secrets.
### Browser Evidence Required
Playwright artifacts, exact commands, environment, timestamps, and explicit PASS/BLOCKED/SKIPPED rows.

## Implementation status

Created `implementation/evidence/feature-184-manifest.md`, linked focused local proof, and completed the follow-up ten-round implementation-vs-spec review. Full end-to-end Worker, sidecar, Playwright, migration dry-run and deployment proof is explicitly blocked/pending until the corresponding environments are available.
