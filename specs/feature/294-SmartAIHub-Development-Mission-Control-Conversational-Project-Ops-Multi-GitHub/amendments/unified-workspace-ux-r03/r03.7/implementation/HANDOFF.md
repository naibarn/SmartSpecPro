# R03.7 Implementation HandOff

Updated: 2026-11-16 (Asia/Bangkok). Source and disposable-fixture evidence is
separate from shared DEV migration, deployment, enrollment and live execution.

## Target and boundaries

- Target is `modular-debian-dev` / `https://aimarkethubs.com` only.
- Preserve Legacy `smartaihub.app` and Production `smartsihub.com`.
- Reuse the installed Rust Runner and Codex CLI. The Legacy Runner service,
  credentials and data root were not changed or copied.
- `worker_jobs`, its outbox, Job/Attempt, Mission binding and events remain the
  canonical execution authority. No second scheduler or event ledger was added.
- Migration 0443 was not modified or replayed.

## Integrated source

- SmartSpecPro `main` and `origin/main`: `39f5b2309b1f3327cdc8e089bf1a699c92e180b7`.
- Platform `main` and `origin/main`: `ff9d08ca8d038d7973c9dcf138d7a0abe8d5745c`.
- Platform `ab6f77e` implements Hono pairing/approval/token lifecycle and
  RSA-SHA256 device proof; `ff9d08c` adds the authenticated signed control
  envelope for the installed Runner's heartbeat/reconcile and capability
  publication messages. The control route accepts only the installed protocol
  and the registered `modular-development` identity.
- SmartSpecPro migration 0444 is integrated. SHA-256:
  `aa83e28e486a2efb45c64fefbfb7bd5e92dbb95089f911db2a1c00b47380bd6d`.
- Additive migration 0445 and its PG fixture are prepared in this checkpoint.
  SHA-256: `3865e2079e4af9017dea71381e0ed027850da4fc09878d9713bf0e9e096ebef7`.
  It writes capability/heartbeat projections into existing Runner registries
  and adds only a bounded control receipt/idempotency table; it does not create
  a Job queue or a second event store.
- Disposable PostgreSQL 15.17 fixture passed for 0444+0445, pairing lifecycle,
  nonce/token replay, capability snapshot projection, heartbeat, receipt
  idempotency/order, revoke and ACLs. Run `5d8f6bd1`.
- Platform focused tests passed: `runnerRoutes.test.ts` and
  `deviceProof.test.ts` (10/10); `@smartaihub/saas-core` typecheck passed; the
  Wrangler build dry-run passed (593.83 KiB / gzip 134.28 KiB) and resolved the
  logical target as `modular-debian-dev`. These checks do not prove deployment.

## DEV migration/deployment state

- Registered migration command `pnpm --dir apps/web db:migrate` was attempted;
  it stopped before connecting with `Database not configured. Set DATABASE_URL`.
- No `DATABASE_URL` or Modular DB secret binding is present in the current
  process environment. PostgreSQL at `127.0.0.1:5432` accepts connections, but
  a read-only identity probe as `smartspec_migrator_dev` failed with
  `fe_sendauth: no password supplied`; no schema was mutated. Do not use the
  legacy `smartspec_dev` credential.
- The missing dependency is the authorized credential/binding for the existing
  `smartspec` DEV database, exposed to the registered migration runner as
  `DATABASE_URL` for `smartspec_migrator_dev`. The current tools do not expose a
  usable secret-manager binding. Do not retrieve the secret by dumping a
  service environment or fall back to the legacy credential.
- Public health checks return 200 at `/livez`, `/api/chat/livez`, and `/login`.
  `POST https://aimarkethubs.com/api/runners/connect/start` with an empty JSON
  object returns 405, so the new route is not present in the served release.
- Registered target metadata still identifies the preserved active Modular
  release as `92f309e1043c47a5710528aca118c9d557520f39`. Do not claim a new DEV
  deploy or handover. Local `smartsihub-core-dev.service` and
  `smartsihub-shell-dev.service` report inactive in this execution environment;
  that local status is not evidence about the public origin.

## Slice status

| Acceptance | Status | Evidence / remaining work |
| --- | --- | --- |
| `PAIRING_ROUTES_DEPLOYED` | BLOCKED | Source integrated; 0444/0445 not on shared DEV and public route returns 405. |
| `OWNER_APPROVAL_FLOW_WORKING` | PARTIAL | Route requires authenticated owner session/MFA path; no real owner browser approval. |
| `DEVICE_PROOF_PINNED` | PARTIAL | Route verifies against enrolled key in source/fixture; no live enrollment. |
| `DURABLE_NONCE_REPLAY_REJECTED` | PARTIAL | PG15 fixture passes; shared DEV behavior not verified. |
| `TOKEN_REFRESH_VERIFIED` | PARTIAL | PG15 fixture passes rotation/replay; shared DEV behavior not verified. |
| `HEARTBEAT_ACCEPTED` | PARTIAL | Installed `runner.reconcile` accepted in source/fixture; not live. |
| `CAPABILITY_PUBLISHED` | PARTIAL | Capability snapshot accepted and existing registry projected in source/fixture; not live. |
| `MODULAR_RUNNER_ENROLLED` | BLOCKED | Requires DEV migration/deploy and real MFA owner approval. |
| `HARNESS_INSTANCE_REGISTERED` | PARTIAL | Fixture projects a synthetic Codex row; no real DEV Runner evidence. |
| `CANONICAL_JOB_ASSIGNED` | NOT_TESTED | Slice C producer/claim/ack/receipt integration is not implemented. |
| `RUNNER_ACK_VERIFIED` | NOT_TESTED | No canonical command was dispatched. |
| `CODEX_EXECUTED` | PARTIAL | Installed CLI probe passed; no execution from a canonical `worker_jobs` Job. |
| `MISSION_JOB_ASSOCIATED` | NOT_TESTED | No live Job/Attempt was executed. |
| `TASK_CONTROL_DEEP_LINK_VERIFIED` | NOT_TESTED | No live Job/Attempt identity to navigate to. |
| `EVIDENCE_CAPTURED` | PARTIAL | Installed CLI probe and fixture evidence exist; no canonical execution evidence. |
| `DEV_DEPLOYED` | BLOCKED | Migration binding is missing; served release remains `92f309e…`. |
| `OWNER_UAT` | NOT_TESTED | No authenticated owner MFA browser flow was performed. |

## Resume steps

1. Bind the authorized Modular DEV `DATABASE_URL` for role
   `smartspec_migrator_dev` to the registered migration command; confirm the
   target is database `smartspec` and environment `modular-debian-dev` without
   printing the secret.
2. Run `pnpm --dir apps/web db:migrate`; verify 0444/0445 ledger hashes, schema,
   function ownership/ACL, runner registry projection grants and cleanup.
3. Build and deploy Platform `ff9d08ca8d038d7973c9dcf138d7a0abe8d5745c` only
   through the registered `modular-debian-dev` controller; verify source SHA,
   release receipt, health, and public `/api/runners/connect/start` routing.
4. Perform real owner MFA approval and enroll the installed Runner using its
   separate Modular DEV data root. Verify fresh heartbeat/capability evidence.
5. Implement Slice C by extending the existing canonical Job Control Plane
   contract—not adding scheduler/event storage—then dispatch one harmless DEV
   Codex Job and verify exact Mission/Task identity and captured evidence.
