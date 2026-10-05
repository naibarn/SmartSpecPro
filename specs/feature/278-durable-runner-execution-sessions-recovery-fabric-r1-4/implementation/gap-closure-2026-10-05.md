# Gap closure checkpoint — 2026-10-05

## Loop result

- Spec-to-code review rounds recorded before this continuation: 31. Rounds 32–41 below were performed against the latest integrated main SHA (minimum requested: 10).
- Planning section packets: 11/11 complete (`check-sections.py` state `complete`).
- Local gaps found in this continuation: registration input validation was weaker than the inventory server contract, and migration 0383 collided with current `origin/main` migrations 0383–0386. Fixed pre-spawn validation with a real-process regression test and renumbered Spec 278 migration/journal to 0387/index 373 on the refreshed candidate.
- Local must-do-now gap closed in this continuation: the missing M0 runtime projection producer was wired into the external-agent dispatcher behind the existing default-off feature flag, with stable identity and failure-state handling. Remaining runtime caller work is persistent Session Host start and receipt-driven state updates.

## Deferred implementation and evidence gates

These are not marked complete because the required canonical callers, authorities, external systems, or live evidence do not exist in this worktree. Each requires the named next action before Spec 278 can be called implemented or enabled:

| Gap | Why it remains open | Smallest next action |
|---|---|---|
| Canonical persistent-session start and Host caller | The external-agent dispatcher now creates a feature-gated ephemeral shadow projection, but `RunnerJobCommand` still lacks the complete session/authority/placement/control revision contract and no caller invokes `launch_registered`. | Extend the canonical start/control-plane contract and persist its session row before wiring Runner start to `launch_registered`; add receipt-driven projection updates. |
| Adoption, authority grant lifecycle and Host origin proof | No live signer/trust-root provisioning or host-origin attestation path is configured. | Implement server grant issuance/key rotation and host proof against provisioned trust roots; then wire adoption/expiry to the Host. |
| Session command/input/reconnect path | Existing PTY stream and durable command lane are not bridged through canonical control watermarks, reconnect, revocation and update-drain behavior. | Define and implement the session-aware command and stream contract end-to-end before exposing interactive sessions. |
| Placement enforcement and provider drivers | No placement commit, OS resource enforcement, registered ACP/Cloudflare session driver, or provider certification environment is present. | Add approved driver/placement integration and run platform-specific fault certification. |
| Commercial grants and metering | Spec 280 owns the grant, revocation and economic evidence APIs; none is available here. | Complete cross-spec ownership and consume the authoritative Spec 280 interfaces without Runner balance mutation. |
| Browser and rollout certification | No browser/session runtime or production DB/provider/host evidence was exercised; migration is unapplied and schema/snapshot drift remains. | Reconcile migration snapshot/baseline, then run browser, database and supported-platform certification in the designated environment. |

## Verification after the final code change

- Integrated full Runner package: 141 library tests + 7 Linux Host integration tests passed at SHA `364157539`.
- After M0 projection producer change, on integrated SHA `e98a1987c`: dispatcher/session contract/service/migration tests 14 passed across 4 files; authenticated inventory route regression: 1 passed (earlier checkpoint).
- Earlier full `runnerControl.test.ts`: 22 passed, 1 separate credential-refresh test failed (expects 200, got 503 because refresh storage is unavailable); inventory route passed in the same file.
- Section checker: 11/11 complete.
- Follow-up M0 checkpoint `e98a1987c` is reachable from `origin/main`; no typecheck, production migration, browser/provider action or deploy was performed.

## Closure status

`IMPLEMENTED_WITH_DEFERRED_GAPS`. All safely closable local findings from this continuation are fixed. Spec 278 as a complete feature remains open because the runtime/external gates above are not satisfied; no beta or rollout claim is supported.

## Spec-to-code rounds 32–41 (latest-main re-audit)

All rounds use the section acceptance criteria and implementation evidence, not the planning packet checker. The candidate was rebased onto `origin/main` after three unrelated commits, the follow-up fast-forward checkpoint was promoted as `e98a1987c`, and the four relevant focused Web test files passed (14 tests).

| Round | Surface checked | Result / remaining action |
|---|---|---|
| 32 | Section 01 contracts, migration 0387, journal index 373 | Contract and migration assertions agree; focused migration/contract tests pass. Production apply and historical snapshot reconciliation remain environment/baseline gates. |
| 33 | Section 02 Session Host lifecycle and `launch_registered` | Linux process integration proves primitive only; no canonical Worker invocation exists. Kept PARTIAL. |
| 34 | Section 03 authority, inventory, adoption and fencing | Authenticated inventory observation and stale fencing are present; issuer/provisioned trust, adoption caller and concurrent PostgreSQL proof remain absent. Kept PARTIAL/BLOCKED. |
| 35 | Section 04 command, PTY, reconnect and upgrade lane | Local IPC/stream primitives do not implement server watermarks, owner transfer, reconnect authorization or update rollback. Kept PARTIAL/BLOCKED. |
| 36 | Section 05 placement/resource enforcement | Local reservation is not placement commit or kernel enforcement. No safe local source-only substitute closes the criterion. Kept PARTIAL/BLOCKED. |
| 37 | Section 06 drivers/checkpoint integrity | Local contracts/store exist; trusted registration, provider adapter and deploy provenance are absent. Kept PARTIAL/BLOCKED. |
| 38 | Section 07 Cloudflare/container drivers | Existing transport does not satisfy session reconstruction and the approved runtime adapter is not integrated. Kept DEFERRED/BLOCKED. |
| 39 | Section 08 event stream and delivery | Durable local delivery seam is present; server reconnect/revocation and end-to-end authorization are absent. Kept PARTIAL. |
| 40 | Sections 09–10 projection and commercial evidence | M0 external-agent projection is feature-flagged and observational; positive recovery UI evidence and authoritative Spec 280 APIs are absent. Kept PARTIAL/BLOCKED. |
| 41 | Section 11 rollout/certification and evidence consistency | No production DB/host/browser/provider certification was performed. Corrected stale checkpoint statements; no source claim treats sections packet presence as implementation completion. Kept BLOCKED. |

Outcome: no additional safe source-only patch was identified in these ten passes. Open gates remain explicit in the section files and table above; they are not silently converted to completed work.
