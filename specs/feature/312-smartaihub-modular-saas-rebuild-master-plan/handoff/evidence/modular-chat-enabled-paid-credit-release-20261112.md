# SPEC-312 Modular Chat paid-credit development release — 2026-11-12

## Source, database and target

- Modular application source: `smartaihub-platform/main@f64b9fa0b8575740aaafa24f69c9ee6fdca46d89`.
- Latest platform canonical main after a documentation-only handoff update: `48257d96ae5c05fcc44f036b461982eb0c7df1ff`.
- Shared development database: PostgreSQL `smartspec`; SmartSpecPro migration `0434_modular_chat_enabled_paid_credit_dispatch` is applied. The ledger contract is USD 1 = 10,000 credits.
- Deployment target: `modular-debian-dev`, `https://aimarkethubs.com`, Debian systemd with local Workerd. The separate `smartaihub.app` runtime and `smartsihub.com` production target were not changed.
- Release ID: `modular-debian-dev-f64b9fa0b8575740aaafa24f69c9ee6fdca46d89-enabled-paid-chat-credit`.
- Release manifest SHA-256: `6b840a39428acd748c6fbc073f17a18d4249b32f10235529d468bdcc32362c2f`.
- Deployment completed at `2026-11-12T02:51:19.403922Z` through the authorized target controller. Existing rollback service `smartspec-dev-web.service:3100`, prior tunnel configuration and systemd service snapshot were retained.

## Isolated builds and smoke results

The release was built from the verified immutable source workspace using independent commands:

- `corepack pnpm@10.4.1 run build:core` — `sha256:ae58a1b54910a67482ddca2f29337c206385c9473278515f130d309192e4f485`.
- `corepack pnpm@10.4.1 run build:shell` — `sha256:3310096d3716e20ebd966767b166b072153788dcda889e34e9e332ff54ba776e`.
- `corepack pnpm@10.4.1 run build:chat` — `sha256:5a89b7369ff68589ada3c763ca438771de7808ca19601f73a50965db4d5adb9c`.

The release controller's 11 tests passed. Its local smoke passed: Core 200, Chat 200, Shell 200, unauthenticated Chat session 401, Chat manifest 200 and entry 200. Public smoke passed: Shell root/login 200, Chat health 200, unauthenticated Chat session 401 and Chat module manifest 200. The 401 responses confirm that Chat session/model routes remain protected.

The integrated Chat code intersects enabled shared model mappings with the current OpenRouter catalog and only exposes entries with live quotes and usable credentials. Paid models are supported. The new Core credit repository reads the existing user balance and writes the existing ledger; chat work is admitted to `worker_jobs` plus outbox and executed through the Queue consumer. Pre-release shared catalog inspection found 27 enabled mappings and 22 with a current live quote; entries without a current quote remain excluded. The authenticated model list was not read from the public release during this UAT attempt.

## Authentication and acceptance result

An authenticated UAT attempt used the local credential file for the configured account without displaying or persisting its secret. The public login returned HTTP 401 with `invalid_credentials`; Core's bounded diagnostic recorded `password_mismatch`. Read-only verification against the same shared account row found the account active with MFA enabled. An independent server-side bcrypt library and the Modular Worker WASM bcrypt verifier both rejected the password currently stored in that local credential file against the shared password hash. No password was reset, no MFA was bypassed, and no LLM call or credit mutation was made.

Therefore the development release and public health checks are **PASS**, but authenticated Chat acceptance remains **PARTIAL**. Response/history persistence, exact credit reservation/settlement/ledger delta, and actual desktop/tablet/mobile interaction still need an authenticated run with the current account password and normal MFA flow. CSS has tablet/mobile breakpoints at `64rem` and `48rem`; this is source evidence, not a browser interaction test.

## Remaining work

1. Update the local UAT credential file with the current password through the user's normal login/reset process, then complete one controlled paid-model Chat turn and verify Auto/catalog, Queue progress, history and exact credit ledger delta.
2. Exercise the deployed UI at desktop, tablet and mobile sizes.
3. Prove local Workerd Queue redelivery and Durable Object contention/restart persistence. Keep the matched Legacy/Core latency benchmark, expired session-JTI cleanup operations and managed Cloudflare Queue capacity as explicit scale/production follow-up; production remains inactive.
