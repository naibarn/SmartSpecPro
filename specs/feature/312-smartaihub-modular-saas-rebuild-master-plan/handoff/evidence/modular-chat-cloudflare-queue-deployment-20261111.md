# SPEC-312 Chat Queue deployment evidence — 2026-11-11

## Scope and source

- Modular SaaS source: `smartaihub-platform/main@ba37ee16658a36ecb907580e3fb582c10072c9e5`.
- Shared `smartspec` DB changes: SmartSpecPro commit `bc288e3361c157bcbcd35f1b3086c0cee0a87ca3`, reachable from `origin/main`.
- Release safety and live target receipt: SmartSpecPro `main@b9a591517d127db74a07ae55841c1168422fc0d7`.
- Target: `modular-debian-dev` / `https://aimarkethubs.com`, Debian systemd with local Workerd, database `smartspec`.
- The service uses the canonical `worker_jobs` and outbox rows. Core returns the accepted job promptly, publishes the small job reference to a Wrangler Queue, and retries unpublished outbox rows. Provider account Durable Objects pace starts at 3 seconds and cap starts at 20/minute, 10 active requests per provider account and 3 per user; live OpenRouter daily allowance and provider cooldowns are also enforced. The managed Queue consumer leaves `max_concurrency` unset so Cloudflare can scale consumers while the shared provider limiter protects upstream limits.

## Database and code evidence

- Migrations `0424_modular_chat_worker_queue` and `0425_modular_chat_ambiguous_provider_outcome` were applied through the configured development migration runner. Runtime migration verification returned `READY`; catalog and ledger postconditions confirmed the new outbox lane, claim/settlement functions and grants. The legacy publisher has no due Chat rows to claim.
- SaaS Core tests: 99 passed. Chat tests: 28 passed. Core and Chat package typechecks passed. Core, Shell and Chat Wrangler dry-run builds passed.
- The root `jobOutboxPublisher` focused test passed (3 tests). Release controller tests passed (11 tests), including rejection of absent workspace dependency links.
- Build warning retained: the Chat UI main chunk is 536.44 KB (163.20 KB gzip), above Vite's 500 KB warning.

## Deployment and recovery evidence

The first candidate was rolled back before Tunnel cutover. Its copied pnpm store did not include workspace-level dependency links, so Wrangler could not resolve Core/Chat dependencies. I corrected the candidate artifact by running `pnpm install --offline --frozen-lockfile` in the isolated release directory and rebuilding Core, Shell and Chat. The release controller now checks Wrangler and all declared workspace dependencies before restarting any candidate services.

Release `modular-debian-dev-ba37ee16658a36ecb907580e3fb582c10072c9e5-chat-queue-retry1` was deployed and verified at `2026-11-11T13:34:51Z`. Its release manifest digest is `sha256:b7e69e1d3129a30e7222dae44ce8ccacebef0bfcb5549485aede51c1a1575899`.

Local and public probes passed:

- Core `/livez`: 200; Chat `/api/chat/livez`: 200; Shell `/login`: 200.
- Unauthenticated Chat session: 401; Chat module manifest and entry asset: 200.
- Public Shell `/` and `/login`: 200; public Chat health and module manifest: 200.
- All three modular services and the existing development Tunnel are active and point at this release. The controller retains `smartspec-dev-web.service:3100` as rollback service.

`smartaihub.app` remains on its separate legacy runtime. Production `smartsihub.com` remains `registered-not-activated`; no managed Cloudflare Queue, Worker, DNS record or production secret was provisioned by this deployment. The deployed development Queue is Wrangler's local Workerd Queue.

## Remaining validation

- No real provider request was sent during release verification. Authenticated Chat send, response display, history after reload, and desktop/tablet/mobile behavior still need user UAT on this exact release.
- Package tests exercise queue admission, consumer settlement, rate limiting and ambiguous provider outcomes, but local Workerd Queue redelivery, Durable Object contention and persistence across restart have not been proven end to end.
- Managed Cloudflare Queue autoscaling/load behavior cannot be established from the local Workerd target. Do not claim a measured throughput or speed improvement until a matched load benchmark exists.
- The expired session-JTI cleanup owner remains separate production-readiness work.
