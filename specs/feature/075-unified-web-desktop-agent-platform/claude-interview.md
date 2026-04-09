# Claude Interview

This planning run requested targeted stakeholder clarification, but the user has not yet answered within the current turn.

To keep the deep-plan workflow moving, the plan below uses conservative provisional answers that the user can override later without invalidating the entire package.

## Q1. What is the intended lifecycle of the old localhost `python-backend` desktop path?

Provisional answer used for planning:

- Treat the localhost `python-backend` path as migration-only compatibility for older chat/media flows.
- Do not keep it as the long-term canonical desktop model.
- New Desktop Host capabilities should target `apps/tauri-shell` directly.

Reason for assumption:

- This matches the supersession direction already established in Feature 075 and minimizes long-term architectural drift.

## Q2. Should Desktop Host project into the worker fabric by default?

Provisional answer used for planning:

- No.
- Desktop Host should project into the existing worker fabric only when a team or admin explicitly binds the device as a managed worker participant.

Reason for assumption:

- This preserves separation between "desktop as rich local product surface" and "desktop as worker-fabric participant."
- It also reduces surprise for enterprise admins and limits accidental fleet sprawl.

## Q3. What should happen to outputs from `local-unverified` packages?

Provisional answer used for planning:

- Block publication into shared org surfaces by default.
- Allow local use on the originating device/workspace.
- Require an explicit review or trust-elevation path before those outputs can become shared or verified assets.

Reason for assumption:

- This is the safest enterprise default and aligns with the trust-propagation concerns already identified in the spec review.

## Q4. What is the preferred default posture for Pi integration in managed enterprise installs?

Provisional answer used for planning:

- Favor isolation first.
- Start with sidecar or RPC-style integration in managed installs, while keeping an embedded path as a future optimization if the operational model becomes mature enough.

Reason for assumption:

- Isolation, crash containment, and easier security boundaries are more important than a marginal UX improvement in the first governed rollout.

## Interview Summary

Until the user provides different instructions, this deep-plan package assumes:

1. 004-era localhost proxy behavior is compatibility-only during migration.
2. Worker-fabric projection is opt-in, not the default managed posture.
3. `local-unverified` outputs stay local by default and cannot silently promote into shared verified surfaces.
4. Managed Pi integration should start sidecar-first for stronger isolation.
