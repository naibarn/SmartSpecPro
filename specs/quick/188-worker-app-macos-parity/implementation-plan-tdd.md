# TDD and verification plan

## Test-first order

1. Add target/architecture fixtures and failing tests for complete catalog visibility plus target-specific in-app update selection. Prove Mac Dashboard still shows Windows/Linux downloads while Mac self-update chooses only its own target; legacy Windows clients remain compatible.
2. Add failing Worker App tests for URL construction, platform metadata validation, source-only fallback, and update action branching.
3. Add failing UI tests for native Mac-ready, source-only, no-release, wrong-architecture, loading and error states in Thai/English.
4. Add Rust tests around pure platform policy and runtime identity helpers before wiring native command branches.
5. Add packaging script dry-run/manifest tests before enabling the macOS workflow.

## Regression checks

- existing Worker App Rust/unit/integration suite remains green
- existing desktop release shared/server Vitest remains green
- Windows EXE/MSI response, download redirect and registry autostart behavior do not change
- runtime update continues to reject wrong platform/runtime IDs
- no in-app update/runtime flow accepts an arbitrary cross-origin URL, storage key, or incompatible target; this does not restrict Dashboard download links for other OSes

## Required fixtures/mocks

- `windows-x64`, `macos-arm64`, and unsupported architecture release catalog records
- native DMG, PKG (optional), source ZIP, and legacy Windows static-release records
- runtime manifests for allowed HyperFrames Mac, missing HyperFrames Mac, and Hermes Mac (negative control)
- mocked Tauri invoke/open/download behavior; no real paid provider calls
- authenticated dashboard test environment with a test-only `JWT_SECRET`

## Mac-only release evidence

Must run on an Apple Silicon macOS runner or machine; Linux syntax/typecheck is not sufficient:

- build and install DMG
- codesign and notarization result when enabled
- launch/sign-in/connection health
- runtime manifest download, checksum/signature verification and doctor success
- one queue/heartbeat/claim path and one non-paid local media path
- update handoff/rollback behavior

## Evidence reporting

Report separately: focused tests, full Worker App tests, Mac build/package, signing/notarization, browser smoke, live endpoint/runtime checks, deployment/restart. A successful HTTP health response or source ZIP download is not proof of Mac parity.
