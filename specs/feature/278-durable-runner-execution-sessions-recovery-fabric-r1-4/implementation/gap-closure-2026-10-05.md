# Gap closure checkpoint — 2026-10-05

## Loop result

- Spec-to-code review rounds recorded: 29 (minimum requested: 10).
- Planning section packets: 11/11 complete (`check-sections.py` state `complete`).
- Local gaps found in this continuation: registration input validation was weaker than the inventory server contract, and migration 0383 collided with current `origin/main` migrations 0383–0386. Fixed pre-spawn validation with a real-process regression test and renumbered Spec 278 migration/journal to 0387/index 373 on the refreshed candidate.
- Local must-do-now gaps remaining in the inspected registration/test/doc surfaces: none.

## Deferred implementation and evidence gates

These are not marked complete because the required canonical callers, authorities, external systems, or live evidence do not exist in this worktree. Each requires the named next action before Spec 278 can be called implemented or enabled:

| Gap | Why it remains open | Smallest next action |
|---|---|---|
| Canonical session start and projection caller | Existing `RunnerJobCommand` does not carry the complete canonical session/authority/placement/control revision contract; adding a local caller alone could create unmanaged or unfenced execution. | Extend the canonical start/control-plane contract and persist its session row before wiring Runner start to `launch_registered`. |
| Adoption, authority grant lifecycle and Host origin proof | No live signer/trust-root provisioning or host-origin attestation path is configured. | Implement server grant issuance/key rotation and host proof against provisioned trust roots; then wire adoption/expiry to the Host. |
| Session command/input/reconnect path | Existing PTY stream and durable command lane are not bridged through canonical control watermarks, reconnect, revocation and update-drain behavior. | Define and implement the session-aware command and stream contract end-to-end before exposing interactive sessions. |
| Placement enforcement and provider drivers | No placement commit, OS resource enforcement, registered ACP/Cloudflare session driver, or provider certification environment is present. | Add approved driver/placement integration and run platform-specific fault certification. |
| Commercial grants and metering | Spec 280 owns the grant, revocation and economic evidence APIs; none is available here. | Complete cross-spec ownership and consume the authoritative Spec 280 interfaces without Runner balance mutation. |
| Browser and rollout certification | No browser/session runtime or production DB/provider/host evidence was exercised; migration is unapplied and schema/snapshot drift remains. | Reconcile migration snapshot/baseline, then run browser, database and supported-platform certification in the designated environment. |

## Verification after the final code change

- Full Runner package: 126 library tests + 6 Linux Host integration tests passed before the final UUID format tightening.
- Final Runner Host integration target: 7 passed; `cargo fmt --check` and `git diff --check` passed.
- Web contracts/service/protocol: 16 passed; authenticated inventory route regression: 1 passed; combined focused selection: 5 passed. Full `runnerControl.test.ts`: 22 passed, 1 separate credential-refresh test failed (expects 200, got 503 because refresh storage is unavailable); inventory route passed in the same file.
- Section checker: 11/11 complete.
- No typecheck, production migration, browser/provider action, commit, push or deploy was performed.

## Closure status

`IMPLEMENTED_WITH_DEFERRED_GAPS`. All safely closable local findings from this continuation are fixed. Spec 278 as a complete feature remains open because the runtime/external gates above are not satisfied; no beta or rollout claim is supported.
