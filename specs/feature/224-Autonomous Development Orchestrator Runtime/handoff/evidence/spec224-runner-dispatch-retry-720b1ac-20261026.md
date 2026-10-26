# SPEC-224 Runner Start retry and live state — 2026-10-26

## Source change

- Integrated source: `720b1ac6daaee8bfba9d9d7856a8b2562516a88b` on `origin/main`.
- Root cause repaired: when an authenticated Start had persisted `READY_FOR_LIVE` but the Job Control authorization-hold release did not complete, retry returned the ready status without retrying release. The same run could remain pending without an outbox dispatch.
- The retry now calls the existing idempotent `releaseAuthorizationHold`. Job Control treats its durable hold-release event as proof after queueing, leasing, or settlement, while still requiring tenant/requester binding and the existing authorization checks for a not-yet-released pending job.
- Focused verification: `spec226DevelopmentControl.test.ts`, `spec224AuthorizationBinding.test.ts`, `spec224StartAuthorization.test.ts`, and `jobControlPlane.test.ts`: 144/144 passed. The two regression tests were first observed failing against the prior behavior.

## Current Runner observation

Read-only query of the configured development control-plane database at `2026-10-26T15:15:42Z`:

- Runner `local-runner`, version `0.2.41`, trusted/online; active session `6ddda9fe-0845-44af-9b9f-1e1cb11e1e62`; snapshot revision `snapshot:local-runner:2026-10-26T15:14:53.589Z`, expires `15:19:53.589Z`; last heartbeat `15:15:24.880Z`.
- Registered workspace `ws-smartspecpro-12883242a753`: server snapshot reports clean, fingerprint `0f2eeb70d5767268e5170defcaaf8e4f7182ce6de91a4d210b0d0ade0cbce1`, HEAD `fbd7fd1bd8324973540664d7f7de2bd9e5844757`, branch absent (`null`). This is a server snapshot, not a fresh Windows `git status` command.
- Local canonical Git graph confirms that HEAD is an ancestor of integrated `origin/main` `720b1ac6daaee8bfba9d9d7856a8b2562516a88b`; it is 795 commits behind and has no unique commits. No Windows workspace synchronization was performed because live command output and the actual local worktree were not available.
- Current published Codex state is `not_run`, with no probe expiry/evidence reference. Capability policy decision is `pending`. Trusted Runner status does not prove per-run device consent or issue a run-bound authorization grant.
- Historical capability snapshots show Codex probe `passed` through `2026-10-26T10:59:10Z`, with expiry `11:01:04.395Z`; the first later snapshot at `11:01:14Z` changed to `not_run` despite the same tool fingerprint/version/auth state. This establishes that the probe expired and subsequent publication omitted its evidence; it does not establish why the Windows client omitted the retained diagnostic evidence.

## Acceptance state

- No authenticated owner browser session was available to this execution. No Start mutation was submitted, and no DevelopmentRun, worker job, attempt, lease, dispatch receipt, Windows command receipt, usage/settlement receipt, recovery receipt, or independent Final Verify was created.
- Production runtime was not deployed by this checkpoint. The integrated source fix is not evidence that the production runtime contains it.
- SPEC-224 remains partial. The code retry repair is integrated, but live Windows execution remains unverified.

## Exact continuation

On the existing Windows Runner, use **SmartAIHub Runner → Tools → Codex → Test real task** because the latest published snapshot is `not_run`; wait for the resulting capability to publish and be acknowledged. Then sign in with the existing owner account at `https://smartaihub.app/chat`, open the existing conversation and **Spec 224 workspace**, select the existing Windows Runner and `SmartSpecPro` workspace, keep the cap at USD 1.00, and Start a reversible task that first reports live branch/HEAD/status and checks ancestry. Synchronize only through the existing safe workspace action when live Git proves the tree clean and a fast-forward is valid. Continue using the returned real DevelopmentRun ID for protected dispatch, execution/audit, settlement, recovery, and independent Final Verify.
