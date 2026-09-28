# Section 04 — Policy, Routing and Revenue

**Objective:** Evaluate policy precedence and attribute immutable economic facts
to tenant, project, user, agent, workflow and publisher contexts.

**Files:** extend `economicControlPlane.ts` and settlement service; add policy
tests; adapt existing skill revenue/credit helpers through explicit ports.

**Tests first:** tenant/project/user/agent/workflow precedence; caps and
approval-required results; provider choice explanation; publisher attribution;
currency mismatch; no payout before settlement eligibility.

**Implementation contract:** policy output includes decision, reason code,
policy version and redacted explanation. Revenue allocation consumes immutable
pricing and publisher facts; it does not mutate Marketplace UI or create a
second settlement ledger.

**Acceptance:** denied and approval-required effects are fail-closed and
explainable; existing skill paths remain compatible under feature gating.

## UI/UX Contract

### Target User / JTBD
N/A; returns policy decisions to product surfaces.
### Surface Inventory
N/A; no standalone routing UI.
### Component Map
N/A; service output only.
### State Matrix
N/A; decision/approval/denial reason codes are required.
### Responsive Matrix
N/A; no layout changes.
### Accessibility Acceptance
N/A; consuming UI announces denial/approval.
### Copy Contract
Explainable reason codes require localized consumer copy.
### Browser Evidence Required
N/A for service-only work.
