# SPEC-294 R03.7 — Existing Debian Runner and Modular Codex Execution

**Status:** In progress
**Target:** `modular-debian-dev` (`https://aimarkethubs.com`)
**Source baseline:** Platform `f80685a01703009abd9bbad5cc333f845c4d49cd`; SmartSpecPro current canonical at R03.7 start. **Latest integrated source:** Platform `ff9d08ca8d038d7973c9dcf138d7a0abe8d5745c`; SmartSpecPro `fc064e4642ccca92b1f7514d155223ceab67dab8` (0445 source checkpoint).
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

## Owner continuation — Modular Runner migration and admin pairing UX — 2026-11-17

The owner's explicit 2026-11-17 instruction supersedes requirement 1 above for
the Debian Runner instance being migrated in this continuation: unpair that
instance from `smartaihub.app` and enroll it only with `aimarkethubs.com`.
Do not reuse the old host-bound credential or claim the Legacy registration was
revoked until the remote revoke is verified. Keep the Modular identity and
connection store isolated; retain the local workspace data only where the
Runner's host-scoped storage contract permits it.

The owner also requests an admin-only Chat action to create a fresh approval
link for reconnect/re-enrollment. A browser-only implementation is explicitly
insufficient: the enrolled Runner's private key must remain on Debian, and the
existing pairing API creates a challenge only after the Runner initiates
`/api/runners/connect/start`. The required implementation is a narrowly scoped
Runner-side pairing relay/mailbox plus an authenticated admin action that
returns the one-time approval URL only after the host Runner has created the
challenge. Do not make the Worker spawn a shell command, expose a private key,
or fabricate a link. Ordinary transient disconnects must continue to recover
through the existing reconnect/refresh flow; the approval link is for explicit
re-enrollment only. If host credentials are absent or invalid, surface that
state and require the documented one-time host bootstrap path.

New acceptance evidence on 2026-11-17:

- Platform `d223283c619c9f9ab9ba3ab8d5cf2c4eb4cdabff` is integrated and
  deployed through the registered `modular-debian-dev` controller. The
  Runner-approval page now shows safe, actionable API failure reasons instead
  of collapsing all failures into “Check your sign-in”; focused Runner route
  tests passed 7/7 and the release controller reported
  `DEPLOYED_AND_VERIFIED` with Core/Chat/Shell local and public smoke checks.
- A headless Debian Runner pairing attempt targeted
  `https://aimarkethubs.com/api/runners/runner-modular-dev-debian-20261117/control`
  with a separate Modular runner/device identity and printed an approval URL.
  The owner browser displayed an approval failure before this diagnostic UI
  deployment. Enrollment has not been confirmed; do not report the new Runner
  connected.
- The Debian `smartaihub-runner.service` is stopped pending successful Modular
  enrollment. Its service drop-in points at the Modular control URL and
  identity; the previously stored Legacy credential is not copied into the
  Modular connection store. Remote Legacy revocation remains unverified.
- Admin-triggered approval-link creation in Chat is a new implementation gap:
  no admin UI action, relay/mailbox contract, or recovery behavior exists yet.
  Continue R03.7 with this narrowly scoped feature before resuming canonical
  Job dispatch, then complete actual enrollment and authenticated owner UAT.

## Continuation evidence — admin pairing relay deployed — 2026-11-17

- Platform `0def9c3b2ba905b260033126e9c6cdd059ef205d` adds an admin/workspace-
  admin Chat menu action, server-side owner/admin authorization, and a polling
  view for the real approval URL. Hono returns a link only after the Debian
  Runner initiates pairing and publishes its actual challenge; it never
  generates a code or exports a private key.
- Relay request lifetime is **60 minutes** to allow a headless server enough
  time to claim the request. Once claimed, the actual device approval challenge
  remains valid for **30 minutes**. Both values are independently enforced.
- SmartSpecPro `0446_modular_runner_pairing_relay` is applied to DEV database
  `smartspec`. Migration source SHA-256:
  `d7a211184084f34d8266fb3f1086a9ba81079f8a77d3b6d9eb904ea294988f87`; ledger
  hash and `created_at` match the source/journal. The scoped backup is retained
  at `/home/dev/.config/smartspec-dev/backups/modular-runner-pairing-0446-scoped-20261117T004327Z.dump`.
- Platform source `0def9c3b2ba905b260033126e9c6cdd059ef205d` was built as an
  immutable Core/Shell/Chat artifact and deployed only to
  `modular-debian-dev` / `aimarkethubs.com`. Release:
  `/home/dev/modular-development-releases/modular-debian-dev-0def9c3b2ba905b260033126e9c6cdd059ef205d-runner-pairing-relay`.
  The registered controller reported Core/Chat/Shell local health 200, Chat
  session without a cookie 401, and public Shell/Chat health 200.
- A separate `smartsihub-modular-dev-runner.service` is enabled with its own
  runner/device IDs, environment file, relay key, and data root. It is active
  and polling. It is **not enrolled yet**; without an access token its normal
  control refresh reports `RUNNER_ACCESS_TOKEN_REQUIRED_FOR_CONTROL`. The
  existing `smartaihub-runner.service` was not started or modified by this
  continuation. No authenticated browser action has yet created a relay, and
  no owner approval or real Job execution is claimed.
- The public relay poll route rejects unauthenticated requests with 401. The
  shared-schema privilege cleanup remains open: `modular_chat_mission_owner`
  has `CREATE` on `public` via the `pg_database_owner` grant; the scoped
  migrator cannot revoke a privilege it did not grant. A database owner must
  remove that temporary grant under the R1.24 bootstrap cleanup procedure.
- Next: sign in as an authorized workspace admin at `/chat`, select the Chat
  menu action to create the 60-minute relay request, wait for the headless
  Runner to publish its 30-minute approval URL, approve with MFA, then verify
  enrollment before attempting a harmless canonical Codex Job. Canonical Job
  dispatch, authenticated UAT, and Mission/Task identity continuity remain
  pending.
