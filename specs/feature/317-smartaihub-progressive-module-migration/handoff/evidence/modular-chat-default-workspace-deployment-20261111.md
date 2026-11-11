# SPEC-317 Chat workspace default and controls — 2026-11-11

The independently built Chat and Core slice from `smartaihub-platform/main@d1e71fe8aa4b8019f08559a5e69a15a4f9228930` is deployed to `modular-debian-dev` / `https://aimarkethubs.com`. On first authenticated Chat load, Core provisions an environment-scoped personal default workspace idempotently. The Chat toolbar lets the user select an authorized workspace or create and immediately switch to another personal workspace.

Migrations 0420 and 0421 are applied to the existing development `smartspec` database. Independent Core, Shell and Chat builds passed. The target release controller returned `DEPLOYED_AND_VERIFIED`; local and public health checks, unauthenticated-session 401, Chat manifest/assets, target binding and port-3100 rollback health passed. The controller retained a Tunnel rollback config and the previous service drop-ins are preserved under the release's `rollback/systemd/`.

Ten focused review passes and detailed DB/security/UI evidence are recorded in [SPEC-312 workspace deployment evidence](../../../312-smartaihub-modular-saas-rebuild-master-plan/handoff/evidence/modular-chat-default-workspace-deployment-20261111.md).

Authenticated visual UAT remains open. The composer remains disabled until scoped Chat persistence and a model provider are configured; this release does not claim AI responses are available. Browser Pilot and `smartsihub.com` production remain unchanged.
