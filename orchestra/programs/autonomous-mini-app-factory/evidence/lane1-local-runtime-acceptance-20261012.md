# Lane 1 Local Mini App Runtime Acceptance

## Source and workspace

- Canonical source SHA: `c4abd4688b0dfc210dd58ea64210893cf222cf4f`.
- Workspace: `/mnt/SmartSpecDev/.cache/codex/worktrees/global-mini-app-factory-lane1-20261012`.
- Workspace admission: `WORKTREE_CREATED_AND_REGISTERED`; the shared `workspace_authority.py create` path admitted the workspace at the exact canonical SHA. No fallback or recovery rollback was needed. The registered G0 worktree and dirty primary checkout were left untouched.
- Resource observation before admission: `/mnt/SmartSpecDev` had 666 GiB available and 60,187,865 free inodes; after admission the worktree filesystem observation showed 713,374,654,464 bytes and 60,187,865 inodes available.

## What was exercised

Command: `pnpm --filter @smartspec/web run test:mini-app-full-runtime`.

The existing runtime fixture created a disposable PostgreSQL 17.11 database and started the normal SmartSpec web server on loopback. It did not connect to a shared or production database. Results:

- Health and readiness endpoints returned 200; Project Wiki and Research Notes app routes returned 200.
- Authenticated Project Wiki CRUD passed. Viewer writes, cross-tenant reads, and cross-project reads were denied.
- Project Wiki data remained available after restarting the app process.
- The existing same-runtime background-worker and Research Notes summary settlement checks passed. The provider was explicitly `synthetic_cost_free_executor_dependency`; this does not prove a live AI provider or Factory Runner execution.
- The Project Wiki hosted route passed Chromium CRUD journeys at desktop (1440×900), tablet (768×1024), and mobile (390×844); horizontal overflow checks passed at each viewport.
- The final runtime marker was `FULL_APP_RUNTIME_BOOT_PASS runtimeId=loopback:33081 postgres=17.11 healthz=200 readyz=200 project_wiki_ui=200 project_wiki_authenticated_api=PASS project_wiki_restart_persistence=PASS research_notes_ui=200`.

These are real application/runtime and browser interactions for the already implemented Project Wiki Mini App. They are not evidence that a new user request was converted into this app by the Factory stages.

## SPAAS package result

The Project Wiki package was built twice using `apps/web/scripts/build-mini-app-package.ts` at the same source SHA. Both builds produced the same package digest `spaas-package-v1:sha256:0f5094b9fded79258095dd1fc8c418729199006ae964d416e621f80b2525c62a` and archive SHA-256 `6504ebed1ac2c85ca1bb31f5f2a0c578048f20b343711ce39f4aa8faec55476a`.

Offline SPAAS validation returned `needs_context`: local mandatory stages V1, V2, and V4 passed; required V5 runtime-placement and V6 migration-rollback evidence were not supplied for this exact package digest. V3 passed as non-mandatory, and V7/V8 were not applicable. The deterministic package build is therefore not a complete SPAAS validation pass.

## Factory boundary and blockers

- The canonical pipeline declares 18 stage IDs, but `miniAppFactoryRunExecutor.ts` accepts stage implementations from a caller. Production composition in `miniAppFactoryRuntime.ts` intentionally disables synthetic execution and creates a trusted Runner child for the selected stage through `miniAppFactoryRunnerStageAdapter.ts`; it does not implement the stage's work itself.
- The Project Wiki-through-PACKAGE Factory test uses synthetic stage callbacks. No production handler has been verified for `requirements_intake`, so G1 is the earliest unverified functional boundary; later stage IDs likewise lack verified end-to-end handler execution from a real request.
- Current local Runner observation from `smartaihub-runner status`: version `0.2.23`, state `ready`, `readyToolCount=0`. Codex is installed but auth, availability, and health are `unknown`, trust is `discovered`, and the reason is `probe_required`. This is not an authorized Codex stage executor.
- Deployment/migration/smoke/UAT on a registered non-production target remain blocked by the absent target, isolated DB/credentials, and target-owner authorization recorded in the current program handoff. No Cloudflare action, owner approval, staging migration, or deployment was performed.

## Next action

The Runner owner/operator must refresh and register an authenticated Linux Runner Codex capability through the existing Runner control plane and bind it to a real authorized DevelopmentRun/workspace/source. Then execute the existing Factory path from `requirements_intake` using a real request and retain stage receipts. In parallel, the target owner must authorize a specific isolated non-production target and credentials before G6 operations. Until those predicates pass, the Factory outcome remains partial and unverified.
