# Worker App and Chrome Extension Recovery Plan

## Goal
Restore Worker App pairing and preserve normal Chrome Companion pairing, with an Admin UI to initialize, inspect, rotate, and safely retire Worker pairing encryption keys. Do not edit any `.env` file.

## Classification and constraints
- Scope/risk: large/high; authentication, encrypted session persistence, Admin UI, Worker App, and Chrome extension compatibility.
- Route: inline Orchestra conductor; no subagents because the active collaboration policy forbids unrequested delegation.
- Preserve all existing worktree changes. Existing `orchestra/plan.md`, `orchestra/test-design.md`, and `orchestra/lifecycle.md` belong to other work and will not be edited; task evidence is isolated in this directory.
- Do not use Agency, `/workflows`, `workpacks/*`, OpenSandbox, or Docker dispatch.
- Do not run repository typecheck; the repository AGENTS.md prohibits it.
- No Production migration, Cloudflare secret update, or broad release is in scope. The later user request to restore Worker Connect authorized a scoped Web code fix and restart of the already-active serving unit, recorded below.

## Evidence ledger
- source: screenshot + server route + runtime/database inspection
- identifier: `POST /api/workers/connect/start`
- observed failure: `Worker connection state is temporarily unavailable; try again shortly` (HTTP 503)
- data state: local PostgreSQL `smartspec` is at migration 0349; `ephemeral_authorization_sessions` exists and has 0 rows; no Worker keyring setting exists. Running Web Node processes have `LLM_ENCRYPTION_KEY` and `JWT_SECRET`, but no `AUTH_SESSION_ENCRYPTION_*` variables. Raw secret values were not read or printed.
- confidence: high for the local failure cause; Production parity remains unverified.
- next evidence needed: focused tests and local route/readiness proof after implementation; authenticated Production browser proof requires an available session and deployment access.

## Codebase findings
- Worker pairing is implemented by the Node Web route and `ephemeralAuthorizationSessionStore`; it currently requires a process environment keyring.
- Admin sensitive settings already persist ciphertext in `system_settings` using AES-256-GCM via `LLM_ENCRYPTION_KEY`; admin APIs mask the value.
- The Chrome extension uses a separate Marketplace Extension JWT/device-binding flow. It does not use the Worker pairing session keyring.
- The Cloudflare Worker in this repository handles runtime queue publication and search-cache requests, not `/api/workers/connect/*`. Pairing keys therefore remain available to the Node Web service; Cloudflare Secrets continue to be used only by Cloudflare Worker code.
- Local web runtime has `LLM_ENCRYPTION_KEY` configured in the app-specific runtime environment, so UI-managed keyring storage can use the established encrypted-settings mechanism without changing `.env`.
- No live Web server is currently listening on port 3000; nginx `/healthz` succeeds while its app upstream returns 502. Do not treat source tests as Production proof.

## Delivery sequence
1. Add failing tests for keyring resolution, encrypted settings persistence, new-key initialization/rotation, legacy ciphertext decryption, active-session re-encryption, authorization, and secret redaction.
2. Implement a server-only keyring service backed by encrypted `system_settings`, preserving the existing AES-256-GCM session envelope and a compatibility reader for the previous JWT-derived keyless envelope. Keep environment fallback only for existing installations and allow one-time encrypted import through Admin UI.
3. Add strict admin procedures for status/self-test, initialize/import, rotate, batch re-encrypt, rollback active key selection, and prune only when no unexpired session references a key. Never return key bytes to the browser.
4. Add a Thai/English Worker Pairing section in Admin → Settings → Infrastructure with readiness checks, statuses, safe actions, rotation/rollback steps, environment separation, and troubleshooting instructions.
5. Add regression coverage for the Chrome Companion token issue/delivery flow and ensure extension tokens remain rejected by Worker routes. Change extension code only if a reproducible defect is found.
6. Run narrow Web route/service/UI/extension checks, build the extension, inspect the final diff, and attempt a local authenticated smoke if a supported local session is available. Record any Production/deployment evidence gap.

## Acceptance criteria
- Worker connect start/status/approve/token flow succeeds when the encrypted keyring is initialized in Admin UI; missing schema, unavailable root encryption, malformed keys, and DB errors show safe actionable status and fail closed.
- Newly issued sessions use the active 32-byte AES-256-GCM key; stored session ciphertext format and hashed lookup values are unchanged.
- Previous keyless AES-GCM Worker sessions remain decryptable while the derived legacy key is available and can be re-encrypted before that key is retired.
- Rotation writes new sessions with the new active key, retains old decrypt keys, supports switching the active key back, and refuses to prune a key still referenced by an unexpired session.
- UI/API responses, logs, diagnostics, and errors never expose key material or session contents.
- Chrome extension can still obtain/store its device-bound token and call Marketplace Capture endpoints; a Marketplace Extension token cannot authenticate Worker routes.
- No `.env` file changes; no unsupported assertion that local tests prove Production deployment.

## Stop boundaries
- If a Production-only migration, secret-manager mutation, Worker version deployment, or authenticated browser smoke is required, prepare all artifacts first and stop for final approval at that boundary.
- If the active deployed runtime lacks the existing root encryption key, do not store a wrapping key in plaintext in PostgreSQL; surface the secure bootstrap blocker rather than weakening encryption.

## Execution update — 2026-09-28
- Read-only inspection found the active `smartspec-web.service` runs `/home/dev/smartspec-web-recovery/apps/web`, with `LLM_ENCRYPTION_KEY` present and both dedicated `AUTH_SESSION_ENCRYPTION_*` variables absent. PostgreSQL `ephemeral_authorization_sessions` had zero rows before the smoke.
- Updated the session crypto resolver in both the primary checkout and the serving recovery worktree: a complete explicit keyring remains preferred; when neither dedicated setting is present, derive a domain-separated AES-256-GCM key (`derived-v1`) from the existing `LLM_ENCRYPTION_KEY`. A partial/malformed explicit keyring still fails closed. Session envelopes and PostgreSQL lookup/storage format are unchanged. No `.env` or secret-manager values were changed.
- Focused tests from the serving worktree passed: `authorizationSessionCrypto.test.ts` and `workerRuntime.test.ts`, 42/42.
- Restarted the already-active Web unit to load its serving-worktree source. Local and public `/healthz` returned 200. A live `/api/workers/connect/start` returned 201, the status readback decrypted the PostgreSQL session and returned `pending` with HTTP 200, and the exact synthetic session row was deleted afterward. Database check after cleanup returned zero session rows. No user account, real Worker, or Chrome extension token was used.
- This restores the Worker Connect session encryption path without Redis. It does not add key rotation UI: changing `LLM_ENCRYPTION_KEY` makes sessions encrypted with the derived key unreadable, so retain that existing root key stable while `derived-v1` sessions may be active. Explicit keyring rotation remains a separate follow-up if independent pairing-key rotation is required.
- Chrome Companion authentication remains separate and was not modified. This smoke proves the live Web pairing start/status persistence path, not an authenticated user approval or completion of token issuance.
