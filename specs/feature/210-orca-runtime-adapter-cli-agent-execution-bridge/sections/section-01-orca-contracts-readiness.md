# Section 01 — Orca Contracts and Readiness

Create `orcaRuntimeContracts.ts` and focused Vitest tests. Define provider,
route, workspace, capability, session and receipt shapes, plus a resolver that
returns ready, setup-required, auth-required, unsupported or disabled with
reason codes. Readiness must be server/Runner-derived and must not launch a
process. Prove stale snapshots and unsupported versions fail closed.

## UI/UX Contract

### Target User / JTBD
Operators need honest Orca readiness before selecting a runtime.
### Surface Inventory
Spec 209 right inspector and execution-option readiness.
### Component Map
Readiness owns reasons; inspector owns status/setup action.
### State Matrix
Disabled, ready, setup-required, auth-required, unsupported and stale.
### Responsive Matrix
Inspector panel/sheet/stacked behavior follows Spec 209.
### Accessibility Acceptance
Reason text, labels, focus and non-color status indicators.
### Copy Contract
Localized status never implies absent provider certification.
### Browser Evidence Required
Verify readiness in the mockup-aligned inspector or record the blocker.
