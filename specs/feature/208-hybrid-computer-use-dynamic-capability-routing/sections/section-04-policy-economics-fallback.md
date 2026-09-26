# Section 04 — Policy, Economics and Fallback

Require Spec 207 authorization and explicit approval for consequential effects.
Keep policy denial distinct from technical fallback and classify auth,
approval, reconcile and verification blockers. Tests cover denied action,
preview cancellation, fallback eligibility and release on failure.

## UI/UX Contract

### Target User / JTBD
Users must understand denial, approval and fallback eligibility.
### Surface Inventory
Spec 209 inspector preview/approval and bottom run/debug drawer.
### Component Map
Policy service owns decision; preview/approval owns action.
### State Matrix
Preview, approved, denied, auth, reconcile, fallback-eligible and failed.
### Responsive Matrix
Readable in desktop panel, tablet sheet and mobile stack.
### Accessibility Acceptance
Consequential actions have labeled confirmation and keyboard focus.
### Copy Contract
Policy denial is distinct from technical fallback in localized copy.
### Browser Evidence Required
Verify preview/deny/approval in the mockup-aligned surfaces.
