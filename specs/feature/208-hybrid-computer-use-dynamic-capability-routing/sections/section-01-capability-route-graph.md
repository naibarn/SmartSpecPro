# Section 01 — Capability Route Graph

Extend browser-session node types and create a server-authoritative resolver
that returns candidate route, requirements, readiness, policy and reason codes.
Tests cover structured WebMCP, semantic browser, local/browser Runner and visual
fallback candidates plus missing capability and policy-denied cases.

## UI/UX Contract

### Target User / JTBD
Users need to understand which capability can run a step and why.
### Surface Inventory
Spec 209 right inspector and bottom run/debug readiness projections.
### Component Map
Resolver owns readiness/reason; inspector owns presentation.
### State Matrix
Ready, setup-required, unavailable, denied, approval-required, loading and error.
### Responsive Matrix
Inspector panel on desktop, sheet on tablet, stacked on mobile.
### Accessibility Acceptance
Reason text/status labels and keyboard focus for route options.
### Copy Contract
Localized Ready/Setup required/Unavailable/Denied/Approval required.
### Browser Evidence Required
Verify route options at 1440x900, 768x1024 and 390x844.
