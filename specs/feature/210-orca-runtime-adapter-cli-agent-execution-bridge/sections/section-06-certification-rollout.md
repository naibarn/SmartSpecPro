# Section 06 — Certification and Rollout

Add provider/OS conformance fixtures, soak/reconnect/process-cleanup and
rollback checks. Keep `orca.v1` disabled unless installation, provider,
credential, Runner, economic, observability and rollback evidence is present.
Tests prove feature-off safety and release-report accuracy; external
certification remains explicitly unverified until run.

## UI/UX Contract

### Target User / JTBD
N/A; release evidence is not a new user surface.
### Surface Inventory
N/A; gate reports feed existing operations views.
### Component Map
N/A; no new component.
### State Matrix
Pass, blocked, unverified and rollback-ready.
### Responsive Matrix
N/A; no layout changes.
### Accessibility Acceptance
N/A; report consumers expose text status.
### Copy Contract
Gate labels are clear and localizable.
### Browser Evidence Required
Installed-provider/browser evidence remains a release gate.
