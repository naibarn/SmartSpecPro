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

## Implementation update — 2026-11-16

- Core now accepts an explicit Mission UUID with a selected conversation and routes it to the canonical Job admission contract. Platform source commit `b4fcf0c676fbbb3bbea2f99ca577bf5fede4b5d4` is integrated; focused Core tests passed 39/39.
- SmartSpecPro adds unapplied migration 0443 for append-only explicit Mission↔Job binding and Mission/Harness projection updates. The SQL integration fixture now requires disposable PostgreSQL 15.17 and checks that conversation-only legacy Jobs remain unbound. That fixture was not run because its dedicated test database bindings are absent; the available local PostgreSQL is 17.11.
- Runner refresh-token regression reviewed: revoked refresh tokens correctly return `runner_refresh_revoked`; the stale unit expectation was corrected and the Runner route/service suite passed 53/53.
- No Modular Runner enrollment/publication/dispatch endpoint exists in the Hono tenant boundary. No Runner was enrolled, no real Codex Job was dispatched, migration 0443 is not applied, and the R03.5 release remains the deployed baseline. Overall R03.6 acceptance remains PARTIAL pending fixture, migration, release and the missing Modular Runner protocol.
