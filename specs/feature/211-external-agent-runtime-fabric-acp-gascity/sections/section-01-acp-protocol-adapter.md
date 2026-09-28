# Section 01 — ACP Protocol Adapter

Create a versioned adapter with JSON-RPC framing, bounds/backpressure,
initialization/capability negotiation, prompt/update/cancel and permission
mapping. Preserve unknown updates safely and never treat transport acceptance as
effect completion. Tests must cover malformed, batch, duplicate, out-of-order,
oversized and permission-binding cases.

## UI/UX Contract

### Target User / JTBD
Users need understandable protocol/session/permission status.
### Surface Inventory
Spec 209 right inspector and bottom debug drawer projections.
### Component Map
ACP adapter normalizes events; inspector/drawer render them.
### State Matrix
Initializing, ready, prompting, permission-required, cancelled, unsupported and error.
### Responsive Matrix
Use Spec 209 panel/sheet/stacked behavior.
### Accessibility Acceptance
Permission choices are labeled, keyboard reachable and announced.
### Copy Contract
Localized copy distinguishes transport accepted from effect completed.
### Browser Evidence Required
Verify normalized status when the adapter is available.
