# Modular Chat provider, persistence, and UI release — 2026-11-11

## Integrated implementation

- Platform source: `smartaihub-platform/main@824c2a3b1c247b675353c783e8979ede9aaaa488` (`fix(chat): connect provider selection and conversations`).
- Shared-database migration: root `main@7c62f6a57`, `apps/web/drizzle/0423_modular_chat_scoped_persistence.sql`. It adds environment/workspace/user conversation scopes and `SECURITY DEFINER` functions for workspace authorization, conversation/message reads and writes, and provider configuration lookup. The functions write the existing `smartspec.public.conversations` and `messages` records; they do not create a parallel message database.
- Migration `0423_modular_chat_scoped_persistence` was applied by the configured development migration runner to database `smartspec`. The development Core role can execute the scoped functions and cannot directly SELECT the Legacy provider tables.
- Existing provider configuration remains in the legacy `llm_providers` and `model_provider_map` records. The existing `LLM_ENCRYPTION_KEY` was installed for the development Core runtime without recording its value. The old AES-GCM key was verified to decrypt server-side; credentials are not returned to the browser.
- The active personal default workspace returned three configured, Auto-eligible OpenRouter chat-completions models through the Core role. The current server path intentionally permits only free models; it does not start a private credits or worker-job ledger.

## Package verification

- Chat package tests: 28 passed across 3 files.
- SaaS Core tests: 85 passed across 15 files.
- Core and Chat package typechecks passed.
- Exact-source independent Core, Shell and Chat builds and Wrangler dry-runs passed. The Chat UI main JavaScript chunk is 534.57 KB minified (162.64 KB gzip); optimize this separately.
- Focused checks cover model selection, API routing, send flow and persisted conversation/message handling. An external provider response and authenticated browser send were not invoked as part of this release verification.

## Development deployment

- Release controller target: `modular-debian-dev` (`https://aimarkethubs.com`), Debian systemd with local Workerd, database `smartspec`.
- Release: `/home/dev/modular-development-releases/modular-debian-dev-824c2a3b1c247b675353c783e8979ede9aaaa488-chat-functional`.
- Controller result: `DEPLOYED_AND_VERIFIED` at `2026-11-11T11:02:22.095199+00:00`.
- Public probes: Shell root/login, Chat health and module manifest returned 200; unauthenticated Chat session returned the expected 401. Local Core, Shell, Chat, manifest and entry probes returned 200.
- Deployed package digests: Core `sha256:68da71d193a44e3e3ec8b6faba782bf039d29681a3ed3287e769c21da4570190`; Shell `sha256:3310096d3716e20ebd966767b166b072153788dcda889e34e9e332ff54ba776e`; Chat `sha256:980cb85e10fda2355260851052cbb8671f440c677fc507899eb493f8512baf45`.
- Root target-map release record is integrated at `main@c240b4282d22f48a609a9148f5801f9d398803ec`. Legacy `smartaihub.app` was not changed. Future production `smartsihub.com` remains inactive and was not deployed.

## Remaining limits and acceptance

- The deployed Chat can select Auto or an available explicit model, submit a turn through the server-side provider path, and persist the conversation to the shared database. User-authenticated browser confirmation of a real provider response, persisted history after reload, and desktop/tablet/mobile behavior is still required on this exact release.
- Turn append currently has workspace/user/environment authorization and one database transaction, but no client request idempotency key. Add idempotent retry protection before relying on automatic retries or broadening this mutation path.
- The mockup's Agent runs, cloud execution, task control and autonomous workflows are not represented as working Chat controls in this release. Keep them unavailable until their approved runtime and `worker_jobs`/outbox contracts exist.
- `Browser Pilot` remains unavailable pending its approved executor, canonical job adapter and egress controls. Production acceptance remains separate.
