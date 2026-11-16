# SPEC-294 R03.7 — Existing Debian Runner and Modular Codex Execution

**Status:** In progress
**Target:** `modular-debian-dev` (`https://aimarkethubs.com`)
**Source baseline:** Platform `f80685a01703009abd9bbad5cc333f845c4d49cd`; SmartSpecPro current canonical at R03.7 start. **Latest integrated source:** Platform `ff9d08ca8d038d7973c9dcf138d7a0abe8d5745c`; SmartSpecPro `39f5b2309b1f3327cdc8e089bf1a699c92e180b7` before the current 0445 checkpoint.
**Parent:** R03.6, which established explicit Mission → Job binding but left Modular Runner registration and execution unresolved.

## Objective

Reuse the installed Debian `smartaihub-runner` and Codex CLI to execute one real, harmless DEV Codex job through the Modular Hono Core. The resulting canonical Job, Attempt, Runner execution session, events, evidence and receipt must be visible in Mission Control and open the exact Task Control execution.

## Requirements

1. Preserve the installed Codex CLI, Runner binary, legacy `smartaihub.app` Runner service, its credentials, data root, connection store, tenant and workspace authorization. Do not install competing infrastructure or retarget the legacy Runner.
2. Match the existing Rust client contracts (`sah-runner-v1`, `sah-runner-connect-v2`, `runner-job-v1`) and device proof. Reject unsupported versions and fail closed on invalid signatures, stale nonces, tenant mismatch, revoked devices, stale capability snapshots, lease/fence mismatch, replay and cross-workspace access.
3. Provide a separately scoped Modular DEV Runner identity and connection store. Pairing requires the normal authenticated owner approval flow; MFA must not be bypassed. Persist credentials only in the isolated Runner data root with existing secure file permissions.
4. Implement the required Hono pairing, approval poll, credential refresh, control WebSocket/HTTPS fallback, capability update, heartbeat/reconcile, command delivery, receipts/events, reconnect/replay and revocation operations. The control plane must use canonical `worker_jobs`, `worker_job_attempts`, `worker_job_events` and `runner_execution_sessions`; it must not introduce a second scheduler or execution database.
5. Enforce Modular tenant and workspace scope in authenticated pairing approval and every read/write. Runtime DB access must be through narrowly scoped security-definer functions; do not grant the Hono runtime direct table mutation or reuse the legacy DB role.
6. Admit one explicit Mission-bound DEV Codex task through the canonical Job Control Plane. Execute through the existing Runner/Codex adapter, capturing only genuine events and evidence. Keep Job, Attempt, Run, Harness and Session IDs distinct and stable.
7. Mission Control LIVE must show the real registered Harness and execution. Task Control deep link must resolve the exact Job and Attempt, preserve the return context, and show evidence coverage honestly (`FULL`, `PARTIAL`, `NOT_CAPTURED`, or `REDACTED`). Navigation must not create, cancel, duplicate, or redispatch work.
8. Test protocol compatibility, tenant isolation, pairing/session rotation, proof replay rejection, capability freshness, lease fencing, idempotent receipt ingestion, reconnect/replay and exact Mission/Task identity using disposable PostgreSQL fixtures. Do not replay migration 0443. Add a new additive migration only if the inspected schema proves it is required.
9. Deploy only through the registered `modular-debian-dev` controller. Do not modify `smartaihub.app`, publish a Cloudflare Worker, or touch `smartsihub.com` production.
10. Report each requested acceptance item as PASS / PARTIAL / BLOCKED with source SHA and evidence. `OWNER_UAT` remains pending unless an authenticated owner browser session actually approves pairing and verifies the real UI.

## Contract evidence already inspected

- Installed binary: `/home/dev/.local/bin/smartaihub-runner`, version `0.2.44-dev.1`; current service is a user service and remains connected to its original SmartAIHub configuration.
- Installed Codex: `/usr/local/bin/codex`, version `codex-cli 0.165.0`; the installed `smartaihub-runner verify codex` probe was rerun on 2026-11-16 and returned authentication `ready`, version probe `passed`, task probe `passed` (evidence ref `runner-task-probe:sha256:7192a5620e8ac9d832f35a17e6bdf763956b910e0b861e404bd1f4dece59c2e6`).
- Rust client requires `/api/runners/connect/start`, `/api/runners/connect/token`, `/api/runners/:runnerId/access/refresh`, and `/api/runners/:runnerId/control`; uses signed device proof and WSS-first durable HTTPS fallback.
- Platform has an authenticated harness catalog read API but no matching Runner protocol producer. Existing `modular_core_auth_dev` is intentionally restricted and cannot directly mutate canonical jobs, Runner registry or outbox tables.
- `0442_runner_harness_instances.sql` provides the projection table and read projection; DEV already applied `0443`. Do not alter or replay either migration.

## R03.7 implementation evidence — 2026-11-16

- Installation inspection confirms the existing user service is active as Linux user `dev` and invokes `/home/dev/.local/bin/smartaihub-runner run`. The Codex CLI and Runner installation were reused without changing service configuration or credentials.
- The installed client source confirms pairing at `/api/runners/connect/start` and `/api/runners/connect/token`, refresh at `/api/runners/:runnerId/access/refresh`, and WSS-first control at `/api/runners/:runnerId/control`. The signed proof covers method, exact path, JWT JTI, timestamp, nonce and canonical JSON body hash.
- Platform now contains a tested RSA-SHA256 verifier for that proof format (`apps/saas-core/src/runner/deviceProof.ts`); its focused test passes 4/4. Durable nonce consumption is intentionally not claimed until the runner DB operation is implemented.
- The proof primitive and its 4 focused tests were integrated to Platform `main` as `f80685a01703009abd9bbad5cc333f845c4d49cd`; it is not deployed and is not yet called by a route.
- The public `aimarkethubs.com/livez` request returns the SmartSIHub shell HTML. The existing Modular Core service is active locally, but its currently served release source is still `92f309e1043c47a5710528aca118c9d557520f39`.
- No matching Hono Runner pairing, approval, refresh, heartbeat, capability, job-claim, receipt, replay or revocation producer is present in the active release. Therefore protocol compatibility, Modular enrollment, real Codex Job execution, Mission/Task identity continuity, DEV deployment of R03.7, and owner UAT remain unverified/pending.

## Safety and rollout

Keep synthetic prototype routes separate from LIVE records. Pairing/device enrollment is DEV-only and bound to `modular-development`. Register only current, authenticated, healthy Codex capability evidence. The Linux Runner service for `smartaihub.app` must remain active and byte-for-byte/configuration unchanged. Roll back only the Modular DEV release; preserve canonical jobs and evidence already written.

## Continuation evidence — 2026-11-16

- Platform `ab6f77e` and `ff9d08c` are integrated in `main`/`origin/main`.
  The latter implements the signed HTTPS control envelope for the installed
  Runner's `runner.capabilities.update` and `runner.reconcile` messages, using
  the existing `runner_nodes`, `runner_capability_snapshots`, and
  `runner_harness_instances` authorities. It does not implement Job dispatch.
- SmartSpecPro 0444 is integrated. Additive migration 0445 adds durable control
  receipt/idempotency and capability/heartbeat projection. Disposable PG 15.17
  run `5d8f6bd1` passed; hashes, API test evidence and current blockers are in
  `implementation/HANDOFF.md`.
- Shared DEV migration did not run: registered `db:migrate` exited before
  connecting because `DATABASE_URL` is not bound. Do not use the legacy
  `smartspec_dev` credential. The public route probe currently returns 405,
  confirming the new pairing route is not in the served release. Slice C,
  real enrollment, deploy, live Mission/Task verification, and owner UAT remain
  incomplete; this amendment is not accepted.
