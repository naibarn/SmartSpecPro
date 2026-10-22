# SPEC-310 consumer handoff — Runner Companion boundaries

This is a consumer handoff recorded under SPEC-205 authority. It does not
allocate SPEC-310, modify SPEC-309, or implement Native Harness, Pi Runtime,
multi-agent, or non-Git workspace behavior in the WP1/WP2 branches.

## Source and interface versions

- Reconciled `origin/main`: `0ebbd075ca4f71af1ffb8ce4f1e095e9d1f76de6`.
- Candidate WP1 head: `27200602c527335dbd4385af84a01e55c4ffe89b` (PR #1161).
- Candidate WP2C0 head: `192bd1c0c922446e7a2d4bc51909ac711e2c87ab` (PR #1164).
- Candidate WP2C1 head: `9e0234a41805167896d874f2834654015880be1b` (PR #1166).
- Candidate WP2C2 head: `f4e8ee0dadd4543a46e9606a0f56b9686be890f2` (PR #1167).
- The Runner candidate source is not merged into `main` at this handoff.
- Companion projection: `runner-companion.v1`.
- Runner control protocol: `sah-runner-v1`.
- Runner connection schema: `sah-runner-connect-v2`.
- Runner job command/receipt contract: `runner-job-v1`.
- Authenticated projection endpoint: `GET /api/runner-companion/v1/state`.

## Authenticated Chat and Task Control contracts

WP1 exposes `chat.runOnRunner` through the protected Chat router with strict
input `{ conversationId, runnerId, goal, idempotencyKey }`. It verifies the
conversation against the authenticated user and tenant, then the server—not
the client goal—sets `operation: "observe"` and `action: "none"`. User text
cannot request clicks, typing, refresh, file access, or another execution
mode.

The request enters the existing Feature 195 canonical `worker_jobs`/outbox
gateway. Runner ownership/trust, active Runner session, fresh capability
snapshot, browser readiness and authorization evidence are checked before a
job is admitted. Task Control consumes the existing worker-job and task
observability read models; the companion projection is not a second task
store or scheduler.

Consumers use `runnerNodes.companionState` or the authenticated companion
transport for the typed `RunnerCompanionState` projection. It contains bounded
device, task, approval, evidence and reconciliation views. UI visibility is
not an authorization decision, and projection status is never fabricated.

## Runner device versus user session

- Runner WSS/control credentials authenticate the Runner device, tenant,
  Runner session, capability snapshot, lease and fencing context.
- Companion bearer credentials are a distinct user-scoped
  `desktop_session`, bound to user, tenant, installation/device binding,
  session, audience/client and explicit scopes.
- Browser cookies, Runner device credentials and desktop user tokens are not
  interchangeable.
- `runner:companion:read` authorizes the read-only projection only.
- `llm:chat` authorizes canonical Chat ingress only; it does not authorize
  Runner tools, browser side effects, file operations, or GUI control.
- The installation/device hash is a binding identifier, not proof of physical
  possession. A proof-of-possession key is required before sensitive control
  scopes can be considered.

## Approved admission and execution grants

Currently approved for the WP1 boundary:

1. authenticated conversation ownership and tenant validation;
2. explicit Runner selection against the canonical Runner inventory;
3. read-only browser observation (`observe` + `none`);
4. canonical job admission, lease/fencing, idempotency and durable receipt
   handling through existing authorities;
5. evidence/result references projected to Task Control when a real receipt is
   recorded.

Not granted by this handoff:

- `llm:chat` as an execution grant;
- approval inferred from device visibility or a UI projection;
- direct protected `DevelopmentRun` dispatch without the canonical persisted
  execution-start admission proof;
- unrestricted unattended desktop control, file access, data export, or GUI
  automation;
- a new scheduler, approval service, task store, or SPEC-310 runtime.

Any future execution grant must remain bound to the existing canonical job,
tenant, Runner session, capability revision, lease/fencing token,
authorization evidence, expiry and audit record. Cancellation request is not
confirmation that the process stopped.

## Unresolved permissions and acceptance blockers

- PRs #1161 and #1164 retain failing checks; the MCP live-contract check is
  blocked by missing authorized credentials, and the focused MCP failure also
  includes a mainline retired-service/DB-test baseline. No dummy credentials
  or bypass was added.
- No reviewer approval or protected-main merge has been performed.
- No authorized Windows machine is available for installer, tray, DPI,
  multi-monitor, authenticated companion, Chat Panel, logout/reconnect, or
  screenshot acceptance.
- Real Chat-to-Runner dispatch, durable receipt, Task Control history and
  result visibility remain unverified on a real authorized device.
- Linux headless live acceptance and external tenant/device authority remain
  environment-dependent.
- SPEC-310 still requires its own canonical allocation, owner, admission
  contract and execution-grant design. This handoff is consumer guidance only;
  downstream implementation must occur in a separate SPEC-310 branch/PR.

Evidence is source/test evidence, not Real-device E2E PASS or production
approval.
