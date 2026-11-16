# R03.7 Implementation Specification

## Outcome
Run one harmless Codex execution using the already-installed Debian Runner binary, with an isolated Modular DEV identity, through Modular Hono Core and the canonical `worker_jobs` control plane. Preserve the legacy Runner configuration, service, credentials and data root. Show the resulting canonical Harness/Job/Attempt/Session and genuine evidence in LIVE Mission Control and the exact Task Control execution.

## Boundaries
- Target only `modular-debian-dev` / `aimarkethubs.com`.
- Keep `smartaihub.app` and its Runner connection untouched; never deploy to Cloudflare production.
- Match `sah-runner-v1`, `sah-runner-connect-v2`, `runner-job-v1` and the installed Rust client's device-proof/replay/fencing semantics.
- Use canonical Job Control Plane tables and bounded security-definer DB functions. No second scheduler, credentials copied from legacy, MFA bypass, synthetic runtime records, or fabricated evidence.
- Preserve migration 0443 and the existing 0442 schema/projection. Add only additive migration(s) justified by inspected schema.
- Keep LIVE and synthetic prototype data modes separate.

## Verified Starting Evidence
- Installed Runner: `/home/dev/.local/bin/smartaihub-runner`, version `0.2.44-dev.1`, contracts `sah-runner-v1` / `sah-runner-connect-v2`.
- Installed Codex: `/usr/local/bin/codex`, version `codex-cli 0.165.0`, authenticated account present; the previously observed probe is stale and must be rerun.
- Existing legacy Runner user service is active and must not be modified or duplicated with the same identity.
- Modular Core has authenticated `GET /v1/core/chat/harnesses` using `list_modular_chat_harness_projection`; there are no matching Runner protocol write endpoints yet.
- Existing DB projection is in SmartSpecPro migration `0442_runner_harness_instances.sql`; migration 0443 is already applied. Hono DB role is intentionally restricted.
- Current SmartSpecPro baseline is `871142f0d5a9f737ec80aae71ccdda8495301fd0`; Platform baseline is `92f309e1043c47a5710528aca118c9d557520f39`.

## Acceptance ledger
| ID | Requirement | Evidence required |
|---|---|---|
| R37-01 | Verify/reuse existing Codex and Runner | fresh redacted version, service and isolated adapter probe |
| R37-02 | Add client-compatible Modular protocol | Rust-client contract fixtures plus Hono route tests |
| R37-03 | Enroll isolated Modular identity | owner-approved pairing, distinct identity/store, fresh heartbeat/catalog |
| R37-04 | Execute canonical Codex job | actual Job/Attempt/Session/event/receipt references and output |
| R37-05 | Mission-to-Task navigation | exact IDs survive refresh/back; no dispatch from navigation |
| R37-06 | Preserve security and deployment boundaries | tenant/replay/fence tests, exact DEV target/release verification |
| R37-07 | Owner UAT | authenticated browser flow; pending if unavailable |

## Completion rule
Each acceptance item is PASS, PARTIAL or BLOCKED with timestamped evidence. UAT or external owner approval is never inferred from local tests. A blocker on pairing/UAT does not invalidate independently completed protocol, build or security work.
