# SPEC-294 R03.3 Live Read-Only DEV Delivery

- Platform source: `25c362422641ba8213a9753ca3547f979f2f7c9d`, integrated on `smartaihub-platform/main` and matched `origin/main` at verification.
- Target: `modular-debian-dev` / `https://aimarkethubs.com` (Debian + local Workerd). No Cloudflare Worker/production deployment.
- Artifact: `/home/dev/modular-development-releases/modular-debian-dev-25c362422641ba8213a9753ca3547f979f2f7c9d-mission-control-r033/release-manifest.json`.
- Registered controller result: `DEPLOYED_AND_VERIFIED`, 2026-11-16 03:16:48 UTC. Core, Chat and Shell local health returned 200; unauthenticated Chat session returned 401; public shell root/login and Chat health/module manifest returned 200.
- Direct route check: `/dev/mission-control-live` returned 200 and the current shell asset manifest. Unauthenticated `GET /v1/core/chat/missions` and exact Mission/Job execution route returned 401, as expected.
- Focused Core tests: auth routes and Chat service, 35/35 passed. Core typecheck passed.
- Focused Shell tests: live route and App routing, 14/14 passed. Shell typecheck passed. Core/Shell/Chat immutable build completed; Wrangler commands were dry-run as expected for the Debian target.
- Live API sources: workspace Mission projection `GET /v1/core/chat/missions`; conversation Task Control projection `GET /v1/core/chat/conversations/:id/task-control`; exact read-only Mission/Job/Attempt projection `GET /v1/core/chat/missions/:missionId/jobs/:jobId/execution`.
- Security proof in automated route tests: unauthenticated request rejected; workspace membership denied; stale Attempt and Mission/conversation mismatch fail closed; no Job dispatch is invoked by route navigation.
- Source inspection found no Modular Core Harness catalog/registry endpoint. Task Control projections expose nullable Harness/Agent/Run/Executor/Machine identifiers, and the live page accurately labels missing relationships/evidence `NOT_CAPTURED` / unavailable. No genuine Harness execution is asserted.
- Authenticated owner browser UAT: `PENDING`. `orca-ide computer list-apps` and `capabilities` both returned `accessibility_error` because the computer sidecar exited with code 1. No browser session or owner data was accessed.
- Acceptance: live route deployment and read-only route checks are verified. Genuine Harness execution visibility, exact live Harness-to-Task drill-through, live cross-workspace browser UAT, multi-Harness event tabs, and transcript/tool/terminal/diff/test/receipt evidence remain open until canonical sources and an authenticated browser session are available.
