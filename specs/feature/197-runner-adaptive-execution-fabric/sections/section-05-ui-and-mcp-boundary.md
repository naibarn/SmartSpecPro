# Section 05 — Runner UI and MCP Topology Boundary

## Source coverage

Feature 197 sections 30–31, 60, 70 and all UI/admin/MCP boundary requirements.

## Deliverable

Extend existing `/workers/connect`, device/task views and MCP adapters with truthful health, capability, control, quality/retry and provenance states. Keep inbound, outbound and Runner-local MCP paths distinct.

## UI/UX Contract

### Target User / JTBD
End users connect/select a Runner; admins inspect trusted device pools and local capability health.

### Existing Pattern Reference
Reuse `/workers/connect`, existing worker/job detail, Connected Devices and MCP settings patterns.

### Surface Inventory
Connection wizard, device list/detail, capability inventory, active execution, intervention dialog, provenance/result and admin pool view.

### Component Map
Runner connection/status owns device state; Feature 195 owns Job state; Feature 196 owns policy/capability; MCP panels own connector state.

### State Matrix
Loading, empty, error, success, partial/offline, stale, disabled, selected, hover, focus and unknown reconciliation states.

### Responsive Matrix
Mobile 390×844, tablet 768×1024, laptop 1024×768 and desktop 1440×900; dense inventories stack or scroll without hidden controls.

### Accessibility Acceptance
Keyboard connection/control path, visible focus, labels/semantics, contrast, live status and reduced motion.

### Copy Contract
Thai/English copy distinguishes Offline, Unknown, Stale, Ready, Running, Needs approval and Reconnecting; no local secret is shown.

### Browser Evidence Required
Connect → discovery → claim → disconnect → recovery evidence using existing browser verification procedures.

## TDD steps

Test state matrix and topology separation first; implement UI/projections; run focused Web/Cargo tests and browser evidence where tooling exists.

