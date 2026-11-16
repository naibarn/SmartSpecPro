# R03.5 Implementation Plan

1. Add the minimal Harness registration and execution-binding contract at the existing Runner/Gateway and canonical Job receipt boundary. Reuse the enrolled Runner ID and existing Runner session; issue Harness instance IDs server-side.
2. Persist only the missing crosswalk in an additive, tenant/workspace-scoped table, with uniqueness/idempotency, exact canonical Job/Attempt/session foreign keys, and narrow authenticated projection functions.
3. Add Core contracts/routes and reauthorized repository reads for catalog and exact execution relations. Preserve LIVE and DEMO separation and avoid browser-derived bindings.
4. Adapt Mission Control LIVE and Task Control deep links to real Harness/Job/Attempt identities and preserve per-tab selection/return context.
5. Verify protocol, SQL isolation, Core route, and UI behavior; apply DEV migration, deploy through the modular-debian-dev controller, inspect actual Runner state, and record each runtime/UAT status separately.

Do not modify the legacy Runner service identity or install a second Runner. If runtime service credentials/authority are not reachable from this environment, finish implementation and report actual discovery/UAT as pending while preserving the deployed DEV release.
