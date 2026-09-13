# Section 5 — Verification and rollout

## Ownership boundary

Own cross-section test matrix, macOS runner verification, browser evidence, live endpoint checks, rollout gates and rollback runbook. Do not rewrite feature code.

## Test matrix

- shared/server contract and fail-closed selection tests
- Worker App TypeScript and Rust tests
- Windows regression tests
- Mac packaging dry-run and real Apple Silicon DMG install
- runtime manifest/hash/signature/doctor checks
- authenticated sign-in, connection health, heartbeat/claim, queue and one non-paid local media smoke
- Dashboard browser smoke for all release states

## Rollout gates

1. contract deployed compatibly
2. matching Mac runtime and DMG published
3. latest/download endpoints return correct target and runtime is allowed
4. internal Apple Silicon pilot passes
5. stable release promoted with previous version retained

## Acceptance checks

Definition of done is an actual clean Apple Silicon machine completing install-to-ready flow. Linux checks alone cannot close this section.

## Risks

Separate focused proof from deployment/restart/signing/notarization proof. Do not spend credits or mutate user media during smoke tests.

## UI/UX Contract

### Target User / JTBD

Indirect: prove that the user-facing install/update flow is truthful before promoting a release.

### Surface Inventory

Dashboard release cards, Worker App update status, runtime doctor status, and installer handoff.

### Component Map

Existing surfaces only; verification owns fixtures and evidence, not new UI components.

### State Matrix

All-OS catalog visible, Mac native ready, source-only, unavailable, wrong architecture, runtime missing/ready, update available/failed, and Windows regression.

### Responsive Matrix

Run browser checks at existing desktop and narrow viewport sizes; verify wrapping and no horizontal overflow.

### Accessibility Acceptance

Keyboard navigation, visible focus, readable status/error text, and non-color-only state indicators are part of browser acceptance.

### Copy Contract

Verify Thai and English labels, fallback behavior, and no accidental Windows-only copy on Mac fixtures.

### Browser Evidence Required

Store authenticated browser smoke/screenshot evidence for both platform fixtures; pair it with real Apple Silicon install evidence.

## Implementation status

Focused repository verification is complete: Worker App TypeScript, Rust tests,
release contract tests, Dashboard UI tests, JavaScript/Python syntax checks, JSON
parsing, macOS packager dry-run, and diff whitespace checks pass. The full web
repository typecheck remains baseline-noisy with unrelated existing errors in
other feature areas. Final rollout is blocked only by external Apple Silicon
evidence: native DMG build, signing, notarization, runtime publication,
authenticated install-to-ready smoke, and deployment/restart proof. Linux cannot
provide those gates.
