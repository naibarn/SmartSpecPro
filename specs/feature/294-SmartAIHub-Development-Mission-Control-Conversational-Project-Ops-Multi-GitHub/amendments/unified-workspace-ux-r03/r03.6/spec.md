# R03.6 — Modular DEV Runtime Completion

## Objective

Complete one genuine authorized Codex Harness execution on `modular-debian-dev`, linked to an explicitly selected Mission through canonical Job admission, and expose the exact identities in LIVE Mission Control and Task Control.

## Boundaries

- Preserve the R03.5 registry, migration 0442, Mission UI, canonical `worker_jobs` scheduler, and legacy `smartaihub.app` Runner.
- A Modular Runner must have an independent service/configuration, credentials, state, workspace authorization, logs, and tenant binding.
- Only authenticated Runner publication may create Harness instances. Installed binaries and fixtures are not runtime evidence.
- Mission association is explicit, server-validated, immutable per Job, and written at admission. Never infer or backfill from conversation/title/time.
- DEV changes and deployment are limited to `modular-debian-dev` and the shared `smartspec` contract. No production/legacy deployment or database mutation.

## Acceptance

Record separately: Modular Runner enrolled; Harness registration; fresh heartbeat; Job dispatched; Runner acknowledged; Attempt bound; explicit Mission↔Job association; LIVE Mission read; exact LIVE Task deep link; actual captured evidence; DEV release; authenticated owner UAT.

## Known operational boundary at start

R03.5 evidence reported no Modular Harness instances. The existing Runner Gateway is in SmartSpecPro's legacy server; the Modular Hono Core exposes only an authenticated read-only catalog. R03.6 must verify the current source and deployment before any Runner setup. Do not bridge this boundary by reusing legacy Runner credentials or tenant scope.

## Implementation update — 2026-11-16 (DEV checkpoint)

- Core accepts an explicit Mission UUID with a selected conversation and routes it to canonical Job admission. Platform source `b4fcf0c676fbbb3bbea2f99ca577bf5fede4b5d4` contains the feature; release metadata correction is integrated at `92f309e1043c47a5710528aca118c9d557520f39`. Focused Core tests passed 39/39.
- SmartSpecPro migration 0443 implements append-only explicit Mission↔Job binding and Mission/Harness projection updates. It is applied to DEV `smartspec` on PostgreSQL 15.17; the ledger contains exact hash `83cf992a0eef0793597ca855f6e45c789e75cfca509bc74ce91bf34cf2f6d6f3`. Column grants, function ownership/search path, runtime EXECUTE, no direct runtime table SELECT, and revocation of temporary schema CREATE were verified. The separate disposable PostgreSQL 15.17 integration fixture was not run because its dedicated test database bindings are absent.
- Runner refresh-token regression reviewed: revoked refresh tokens correctly return `runner_refresh_revoked`; the stale unit expectation was corrected and the Runner route/service suite passed 53/53.
- Platform source `92f309e1043c47a5710528aca118c9d557520f39` is deployed to `https://aimarkethubs.com` through the registered `modular-debian-dev` controller. Core/Chat/Shell and public root/login/chat smoke checks passed. Release and rollback evidence is in the R03.6 implementation traceability.
- The Modular Hono tenant boundary still has no Runner enrollment/capability-publication/heartbeat/dispatch producer or scoped credential contract. The authenticated Harness registry currently contains zero `modular-development` instances. No Runner was enrolled, no real Codex Job was dispatched, and no live Mission/Task execution evidence exists. R03.6 remains PARTIAL pending the disposable DB fixture, Modular Runner protocol, genuine execution, and authenticated owner UAT.
