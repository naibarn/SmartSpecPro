# SPEC-224 Modular DEV Runner and source authority · 2026-11-21

The dedicated Debian Runner publishes real inventory and heartbeats to the Hono Core at `aimarkethubs.com`. The existing enrollment authenticates both requests with Runner device proof. The checkout registered with the Runner matches the local SPEC-293 source authority. This checkpoint covers discovery and source verification.

| Evidence | Result |
| --- | --- |
| Runner source | SmartSpecPro `f72ac0e64c004846ef83b996fba20d3228b1b2eb` integrated into `origin/main` |
| Serving web release | `modular-debian-dev` receipt and the active Core and Shell units point to Platform `4600db10d8be7949b72e358597f463ba3a0845cd` |
| Runner executable | SHA-256 `49f975ca587f0b14c21ec1831dca87c3892036039e5c2fd43deeefa1a4ec285d` |
| Runner | `runner-modular-debian-20261117`, active `smartsihub-modular-dev-runner.service` |
| Source scope | Project `20c2fe9c-8082-4dcf-ba3b-91dfe532862d`, repository `github.com/naibarn/smartaihub-platform`, Runner workspace `ws-smartaihub-platform-441231abc877` |
| Host source proof | `workspace_authority.py verify` returned `CANONICAL_CONVERGENCE_VERIFIED`. The same tool's `execution-source-check` compared the Runner crate's `snapshot_facts` with the registered authority and returned `SOURCE_MATCHED` with zero changed paths |
| Active control channel | Core returned `200` with durable ACKs for `runner.capabilities.update` and `runner.reconcile` on multiple 30-second cycles. After a controlled service restart, the sequence advanced and both events were accepted again. The Runner reported two local discovery entries and `dispatchReady=false`. |
| Focused package verification | On 2026-11-21, `cargo test --offline --locked --manifest-path apps/runner-app/Cargo.toml --lib diagnostics::lifecycle_tests` passed 27 tests on the exact Runner source SHA. The locked offline release build used the isolated canonical source with over 20 GiB memory available during verification. |
| Runtime checks | Local Core and public Chat health returned `200`. Anonymous requests to Core Harness and Mission read endpoints returned `401`. |

The prior Runner startup attempted WSS. The Modular endpoint accepts signed HTTPS observation events, and the discovery mode uses that path with persisted monotonic sequences. The mode is scoped to the canonical Modular DEV host and dedicated Linux unit. Its snapshot contains no executable capability grant. The application release above was observed from active service paths and its release receipt. The deployment target registry's recorded release pointer differs from that evidence.

## Continue from this checkpoint

1. Bind the authorized Modular Chat conversation to the project and Runner workspace using a server-owned mapping. The Harness projection expects an authorized Chat workspace ID or a canonical execution relation. The Runner checkout ID is source identity, and the projection must continue to enforce tenant and workspace membership.
2. Expose preparation through Hono using the existing SPEC-224 source authority and Goal Grant contract. Refresh the Runner's actual Harness readiness and dispatch capability before showing that a plan is ready to submit. Source matching at the host is one input to that check.
3. Connect dispatch and attempt evidence to the existing durable DevelopmentRun, `worker_jobs`, and outbox lifecycle. Keep the source SHA, fingerprint, Goal Grant, budget policy, and lease/attempt fencing checks on admission. Pass one authorized DEV Goal through the full path and verify the same IDs in Task and Mission Control, including retry/duplicate handling, terminal receipts, verification, and settlement.

Authenticated browser UAT, Goal preparation and admission, a genuine Harness execution from Modular Chat, and SPEC-224 acceptance remain open. Live Harness projection was not exercised with the owner's workspace session.

The previous binary is retained under `/home/dev/modular-development-releases/runner-discovery-f72ac0e64c/` as `smartsihub-modular-dev-runner.previous`. To roll back the Runner checkpoint, restore that executable atomically, remove only `30-modular-dev-discovery.conf` from the dedicated unit's drop-ins, then reload and restart that unit. Keep its enrollment and sequence state.
