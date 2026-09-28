# Section 03 — Job, Attempt and Receipt Mapping

Admit through `createControlPlaneJob` and existing attempt/event/dispatch/outbox
contracts. Add only proven subordinate route-attempt fields/migration. Map
Orca detail phases to canonical Job status, preserve provider child/session
generation, and distinguish ACK from effect receipt. Tests cover duplicate,
late, stale and restart events plus reconciliation.

## UI/UX Contract

### Target User / JTBD
Users need accurate current step, receipt and reconciliation status.
### Surface Inventory
Spec 209 bottom run/debug drawer and right inspector.
### Component Map
Job projection owns data; drawer owns timeline/output/trace/logs/cost.
### State Matrix
Queued, running, waiting, receipt-pending, verified, failed, stale and reconciliation-required.
### Responsive Matrix
Drawer bottom on desktop/tablet and below run content on mobile.
### Accessibility Acceptance
Timeline is keyboard-readable and async updates are announced.
### Copy Contract
ACK, effect receipt and verified completion have distinct localized labels.
### Browser Evidence Required
Capture drawer states where runtime is available.
