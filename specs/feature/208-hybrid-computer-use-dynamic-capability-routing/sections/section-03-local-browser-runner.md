# Section 03 — Local Browser and Runner

Use existing browser-session and Runner controls for existing-authenticated,
managed and cloud targets plus desktop accessibility. Bind profile/session/
runtime owner, sequence and fence. Tests cover cross-device operation, rebind,
auth-required, cancellation and stale owner.

## UI/UX Contract

### Target User / JTBD
Users need honest local browser/desktop readiness and recovery.
### Surface Inventory
Spec 209 inspector/session drawer and existing Runner controls.
### Component Map
Runner/session services own state; inspector/drawer render actions.
### State Matrix
Ready, connecting, running, auth-required, approval, stale, cancelled and error.
### Responsive Matrix
Desktop panel, tablet sheet, mobile stacked status/recovery.
### Accessibility Acceptance
Keyboard connect/cancel/retry, semantic status and visible focus.
### Copy Contract
ACK is not completion; localize session/blocker explanations.
### Browser Evidence Required
Capture inspector/drawer path or record missing authenticated Runner proof.
