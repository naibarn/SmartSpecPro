# R03.7 Implementation HandOff

Updated: 2026-11-16 (Asia/Bangkok). This handoff records verified source and
fixture evidence; it does not imply a DEV migration, deployment, or live Runner
execution.

## Scope and immutable boundaries

- Target: `modular-debian-dev` / `https://aimarkethubs.com` only.
- Preserve `smartaihub.app` legacy and `smartsihub.com` production.
- Reuse the installed Rust Runner and Codex CLI. Do not retarget the existing
  Runner service or copy its credentials.
- Keep worker_jobs, Job/Attempt, Mission binding and event ledger canonical.
- Never edit or replay migration 0443.

## Current source checkpoints

- SmartSpecPro main/origin baseline: `9c677968b3744be71e5d5166a1bb23637ab989e6`.
- Platform main/origin: `ab6f77e28ce7f575689f8bd19cfd27045c94ffb9`.
- Platform `ab6f77e` adds authenticated Hono pairing approval, one-time
  enrollment/token completion, refresh rotation, revocation, device-key proof
  verification and bounded request bodies. The focused route/proof tests,
  saas-core typecheck and build passed before this checkpoint.
- SmartSpecPro task-owned migration 0444 and target-routing/release checks are
  currently uncommitted. They have not been applied or deployed.
- The active Modular DEV release is still
  `92f309e1043c47a5710528aca118c9d557520f39`; preserve it as rollback source.
- Migration 0443 source SHA-256 remains
  `83cf992a0eef0793597ca855f6e45c789e75cfca509bc74ce91bf34cf2f6d6f3`.

## Verified evidence

- Existing Codex CLI: `/usr/local/bin/codex`, version `0.165.0`.
- Existing Runner: `/home/dev/.local/bin/smartaihub-runner`, version
  `0.2.44-dev.1`, contracts `sah-runner-v1` and `sah-runner-connect-v2`;
  existing user service remains active and untouched.
- Existing Codex probe passed with evidence reference
  `runner-task-probe:sha256:7192a5620e8ac9d832f35a17e6bdf763956b910e0b861e404bd1f4dece59c2e6`.
- Disposable PostgreSQL 15.17 integration fixture passed for migration 0444,
  pairing start/approval, one-time completion, pinned-device lookup, nonce
  duplicate rejection, refresh rotation/replay rejection, revocation, and
  function ACL assertions (no PUBLIC EXECUTE; Modular auth role can execute).
- Fixture command:
  `python3 scripts/spec224_certification/run_disposable_postgres.py -- bash apps/web/scripts/test-modular-runner-enrollment-postgres.sh`.
- The fixture exposed insufficient `runner_nodes` DML/SELECT and function ACL
  behavior. Migration 0444 was corrected to require explicit grant authority,
  grant only necessary columns, revoke PUBLIC before transferring ownership,
  and grant runtime execution under the restricted function owner.
- Migration 0443 was not changed. No shared DEV database was used by the
  destructive integration fixture.
- No authenticated owner MFA approval, live enrollment, heartbeat, capability
  publication, canonical Job dispatch, or end-to-end Codex execution has been
  performed.

## Acceptance status

| Acceptance | Status | Evidence / gap |
| --- | --- | --- |
| `PAIRING_ROUTES_DEPLOYED` | BLOCKED | Source merged in Platform; 0444 not yet applied and Modular DEV not redeployed. |
| `OWNER_APPROVAL_FLOW_WORKING` | PARTIAL | Hono MFA/session-bound route and fixture DB approval work; real owner browser approval pending. |
| `DEVICE_PROOF_PINNED` | PARTIAL | RSA proof verifier + pairing persistence implemented; live device enrollment pending. |
| `DURABLE_NONCE_REPLAY_REJECTED` | PARTIAL | PG15 fixture proved first-use accept and duplicate denial; DEV pending. |
| `TOKEN_REFRESH_VERIFIED` | PARTIAL | PG15 fixture proved rotation and old-token replay denial; DEV pending. |
| `HEARTBEAT_ACCEPTED` | NOT_TESTED | Slice B not implemented. |
| `CAPABILITY_PUBLISHED` | NOT_TESTED | Slice B not implemented. |
| `MODULAR_RUNNER_ENROLLED` | BLOCKED | Requires migration/deploy and owner MFA approval. |
| `HARNESS_INSTANCE_REGISTERED` | NOT_TESTED | Slice B not implemented. |
| `CANONICAL_JOB_ASSIGNED` | NOT_TESTED | Slice C not implemented. |
| `RUNNER_ACK_VERIFIED` | NOT_TESTED | Slice C not implemented. |
| `CODEX_EXECUTED` | PARTIAL | Isolated installed-client probe passed; no canonical Job dispatched. |
| `MISSION_JOB_ASSOCIATED` | NOT_TESTED | No real Job execution. |
| `TASK_CONTROL_DEEP_LINK_VERIFIED` | NOT_TESTED | No real Job/Attempt identity. |
| `EVIDENCE_CAPTURED` | PARTIAL | Codex binary probe exists; runtime Job evidence unavailable. |
| `DEV_DEPLOYED` | BLOCKED | Active release remains `92f309e…`; current source not deployed. |
| `OWNER_UAT` | PENDING | Must use a real authenticated MFA browser session; do not simulate. |

## Immediate resume order

1. Commit and push only the R03.7-owned SmartSpecPro files; preserve every
   unrelated dirty path.
2. Apply 0444 via `pnpm --dir apps/web db:migrate`; verify target, ledger hash,
   function owner/ACL, and runner-node column grants.
3. Build Platform `ab6f77e…` and deploy only with the registered
   `modular-debian-dev` controller; verify public tunnel routes reach Core.
4. Complete the legitimate owner approval in browser when available; report
   the exact pairing URL and manual step if MFA UAT is unavailable.
5. Implement and verify Slice B against the installed Rust HTTPS/WSS protocol
   before attempting Slice C canonical Job execution.

Do not claim enrollment, a live Harness, Job dispatch, Mission continuity,
Task Control navigation, or completion until each is observed in the target.
