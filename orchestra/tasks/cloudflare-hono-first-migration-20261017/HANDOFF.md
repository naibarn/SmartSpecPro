# Hono-first HTTP Migration Handoff

Status: first native Hono slice implemented locally; PR integration and staging acceptance remain open.

Baseline: PR [#1040](https://github.com/naibarn/SmartSpecPro/pull/1040) merged as `931ceeca8f62b053f34752ebc017b1fc98ac9e84`.

## Architecture decisions

- Hono is the default framework for new HTTP APIs. New route handlers should use the Fetch `Request`/`Response` contract and be registered in an explicit route manifest.
- Existing Express APIs migrate incrementally. Keep the Linux Express runtime and its current behavior while individual routes are adapted and proven; no broad Express rewrite is in scope.
- A route classified `WORKER_NATIVE` must execute its actual handler in the Worker. It must not silently proxy to Linux. Keep routes on `ORIGIN_PROXY` until an explicit native handler is implemented and its auth, tenant, streaming, and failure behavior passes tests.
- Auth/session, tenant identity and configuration, credits, provider credential resolution, and job ownership remain canonical shared authorities. Worker adapters call those authorities; they do not create duplicate stores, policies, sessions, or job consumers.
- PostgreSQL remains at its existing location. Hyperdrive is a connection path to that database, not a database migration. Validate driver behavior with a disposable database or a restricted staging role before selecting database-backed routes for Worker execution.

## Environment and tenant boundaries

- Production `smartaihub.app` and development `aimarkethubs.com` use distinct Tenant IDs. Clone tenant configuration as currently required, while preserving the separate identities.
- External provider credentials temporarily use the same credential set through the existing Credential Resolver. Never copy, expose, print, or rotate production API keys as part of this migration.
- Existing login/session authority remains on the origin until a Worker-native path proves cookie, CSRF, OAuth redirect, refresh/revocation, trusted-host, and cross-tenant isolation parity.

## Migration sequence

1. Keep the PR #1040 route manifest fail-closed as the compatibility boundary. Maintain origin proxy as the rollback path for routes that have not passed Worker acceptance.
2. Add Hono alongside the existing Worker entry point for new routes. Put the router behind explicit manifest registration; unmatched methods and paths must remain fail-closed.
3. Select one low-risk, stateless API route. Adapt its existing service boundary rather than duplicating business logic, and execute the handler inside the Worker. Prove the native handler is invoked in Workers runtime tests and that it does not touch native-only process state.
4. For authenticated routes, propagate the existing verified identity/context boundary and test tenant isolation. Keep canonical session and tenant resolution unchanged; do not infer tenant identity from untrusted host headers.
5. Evaluate database-backed routes only after restricted-role Hyperdrive tests cover connection, query, transaction, and error behavior with the existing PostgreSQL instance.
6. Move routes one at a time from proxy to native classification only after focused Worker tests, origin parity checks, and rollback coverage pass. Keep SSE, WebSocket, uploads, and long-running work on their established runtime until independently validated.

## Required proof before enabling a route

- Wrangler build and local Workers runtime tests for native handler execution, method/path matching, fail-closed behavior, request limits, and errors.
- Browser/staging proof for any cookie, redirect, CSRF, OAuth, CORS, trusted-host, or tenant-sensitive flow.
- Two-tenant isolation evidence showing no session, configuration, credit, or job visibility crosses Tenant IDs.
- PostgreSQL/Drizzle proof against disposable PostgreSQL or a restricted staging role for database-backed handlers.
- A documented rollback that restores origin proxy ownership without enabling queues, schedulers, or production routing unintentionally.

## Out of scope and blockers

- No rewrite of the Express API surface, no SPEC-224 or Task Control changes, no job ownership changes, and no production route activation.
- No PostgreSQL relocation, schema change, public database port, or credential rotation.
- Staging auth/origin access, Cloudflare staging configuration, browser E2E credentials, and a restricted PostgreSQL test role must be provided through their existing authorization paths before staging acceptance. Local checks alone do not establish production readiness.

## Next work unit

Implemented slice: added a Hono Fetch router inside the existing Cloudflare package and wired it through the explicit route manifest. `GET|HEAD /.well-known/smartaihub-evidence-keys.json` is the first `WORKER_NATIVE` business API. Express and Hono call the same pure `getPublicEvidenceVerificationKeys` service; auth, tenant, PostgreSQL, job ownership, and other Express route behavior are unchanged. Reclassifying this entry to `ORIGIN_PROXY` restores Linux ownership.

Local evidence on source base `0c872e2cd1344ed618b8668299add58abadbfd1f`:

- Cloudflare package TypeScript check, build, and Vitest: passed; 11 files / 70 tests.
- Linux Express public-key contract tests: passed; 1 file / 2 tests.
- Express route architecture guard unit tests: passed; 4 tests. Existing route edits pass, new one-line/multiline routes fail without exact exceptions, expired/broad exceptions fail, and test files are excluded from production route registration checks.
- Wrangler 4.151.1 dry-run bundle: passed (119.42 KiB, 27.88 KiB gzip).
- Wrangler local workerd runtime: native public-key route returned 200 with no origin binding; HEAD returned 200; its weak ETag and conditional GET returned 304; auth legacy proxy failed closed with 503; unknown path returned 501. The Hono contract test rejects oversized request metadata with 413. These checks prove the selected route executed in the Worker runtime, not via Origin Proxy.
- No production routing, activation, queues, database, tenant configuration, or credentials changed.

Linux workload impact: requests to this public key endpoint no longer reach Express, but traffic volume and CPU savings have not been measured. This slice introduces no job consumers or database activity.

Next: integrate the implementation through the normal PR workflow, then run isolated staging verification. Candidate follow-ups are the deterministic storyboard estimate after factoring its schema/contract away from Node-bound skill-registry imports, then the media credit estimate after reusing canonical auth/tenant context and validating database reads through a restricted Hyperdrive role. Do not expose protected APIs anonymously or mark DB-backed routes native before that evidence exists.
