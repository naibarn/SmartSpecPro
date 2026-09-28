# Section 1 — Release and runtime contract

## Ownership boundary

Own the shared release types, server selection endpoints, runtime publication metadata, and their tests. Do not change Tauri UI or build scripts here.

## Target files

- `apps/web/shared/desktopReleases.ts`
- `apps/web/server/routes/desktopReleases.ts`
- `apps/web/server/routes/workerRuntime.ts`
- `apps/web/server/routes/workerRuntimeReleases.ts`
- `apps/worker-app/src/versionUpdate.ts`
- focused shared/server tests

## TDD expectations

Start with platform/architecture fixtures and tests for complete catalog visibility. Add target-specific, fail-closed selection tests only for in-app self-update/runtime installation, plus compatibility tests for old Windows records.

## Acceptance checks

- complete catalog visibility for all OSes, plus explicit target selection for `windows-x64` and `macos-arm64` only where an app/runtime performs self-install
- native Mac artifact and HyperFrames runtime are distinguishable from source ZIP and Hermes
- missing self-update/runtime target returns typed unavailable state without removing other OS releases from Dashboard
- signed/hash metadata is validated before a release is considered ready

## Risks/coordination

Coordinate field names with Section 2 before client wiring. Preserve database/catalog and public endpoint compatibility; do not require a destructive migration for optional metadata.

## UI/UX Contract

### Target User / JTBD

Indirect: provide a complete release catalog for the Dashboard and a safe target-specific result for Worker App self-update/runtime installation.

### Surface Inventory

No direct visual surface; catalog feeds all OS release cards and target-specific responses feed update status.

### Component Map

No new component. Expose typed target, artifact kind, availability reason, and runtime readiness fields to existing consumers.

### State Matrix

Native ready, source-only, unavailable, wrong architecture, legacy record, and invalid/cross-platform self-install artifact; other OS catalog entries remain visible.

### Responsive Matrix

No layout change; metadata must remain short/structured enough for existing responsive cards.

### Accessibility Acceptance

No direct DOM change; downstream UI must expose the typed state as text, not color-only status.

### Copy Contract

Provide stable reason codes; UI owns Thai/English wording and locale fallback.

### Browser Evidence Required

Section 4 must prove each response state with authenticated fixtures; this section needs contract tests rather than a browser screenshot.

## Implementation status

Implemented target-aware Worker App latest/download resolution for Windows x64
and macOS arm64, including static-file fallback, published catalog compatibility,
canonical self-update URLs, and fail-closed rejection of Linux/Intel targets.
Focused release contract tests cover native Mac DMG selection and unsupported
architecture responses.
