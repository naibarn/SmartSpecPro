# Gap closure checkpoint — 2026-10-05

## Loop result

- Spec-to-code review rounds recorded before this continuation: 31. Rounds 32–41 below were performed against the latest integrated main SHA (minimum requested: 10).
- Planning section packets: 11/11 complete (`check-sections.py` state `complete`).
- Local gaps found in this continuation: registration input validation was weaker than the inventory server contract, and migration 0383 collided with current `origin/main` migrations 0383–0386. Fixed pre-spawn validation with a real-process regression test and renumbered Spec 278 migration/journal to 0387/index 373 on the refreshed candidate.
- Local must-do-now gap closed in this continuation: the missing M0 runtime projection producer was wired into the external-agent dispatcher behind the existing default-off feature flag, with stable identity and failure-state handling. Receipt-driven projection is also wired after canonical receipt persistence. Remaining runtime caller work is persistent Session Host start and M2 adoption/recovery orchestration.

## Deferred implementation and evidence gates

These are not marked complete because the required canonical callers, authorities, external systems, or live evidence do not exist in this worktree. Each requires the named next action before Spec 278 can be called implemented or enabled:

| Gap | Why it remains open | Smallest next action |
|---|---|---|
| Canonical persistent-session start and Host caller | The external-agent dispatcher creates a feature-gated ephemeral shadow projection and receipt updates are projected after canonical persistence, but the canonical Worker command still lacks the complete persistent-session authority/placement/control contract and no caller invokes `launch_registered`. | Extend the canonical start/control-plane contract, persist the session binding and signed grant before dispatch, then wire Runner start to `launch_registered` and verify receipt projection end to end. |
| Adoption, authority grant lifecycle and Host origin proof | `adoptExecutionSessionProjection` is a fenced service primitive with no production caller. Inventory is observation-only, and there is no grant renewal/Host renewal response or host-origin attestation trust path. | Define a canonical recovery request/response that atomically returns the adopted session binding and newly signed grant, adds Host renewal IPC, then invoke it from authenticated recovery and provision trust roots/key rotation. Do not auto-adopt inventory records. |
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

## Follow-up code-to-spec audit rounds 42–51

These ten rounds were run against the current `origin/main` after its 2026-10-05 homepage-routing commits. They distinguish missing implementation from runtime/certification evidence. The receipt-projection statements found stale in the earlier ledger were corrected; no behavior was changed by this audit.

| Round | Requirements / implementation surface | Finding | Closure decision |
|---|---|---|---|
| 42 | §1 canonical M0 shadow projection, runner command binding | Feature-gated projection producer and Rust identity validation exist; the projection is observational and defaults off. | Implemented for the external-agent shadow slice; persistent execution caller remains open. |
| 43 | §1 durable receipt projection | `runnerControl.ts` projects the session only after canonical receipt acceptance; projection failure does not reject job receipt acknowledgement. | Corrected stale ledger claim; no missing caller in this slice. |
| 44 | §2 standalone Host lifecycle and registration | Linux Host, pinned binary, grant validation, descriptor/registry checks, candidate manifest rehydration and terminal receipt replay exist. Canonical Worker does not launch it. | Core runtime integration is still a code gap; requires canonical session+grant command contract first. |
| 45 | §3 inventory and adoption fencing | Authenticated inventory is recorded as observation; adoption service does a job/session lock and CAS but has no caller. | Do not connect observation directly to adoption: renewed grant and Host authority handoff are missing. |
| 46 | §3 grant renewal, key lifecycle, origin proof | Host verifies an out-of-band configured signing key and bounded grant locally; there is no server renewal response, live Host renewal, managed rotation, or Host-origin attestation. | Requires a new server/Runner/Host protocol and trust provisioning; not safely closable by toggling current inventory route. |
| 47 | §4 command ordering, replay and input ownership | Local command journal and Host IPC sequence/idempotency checks exist; Host receipts are volatile until terminal receipt and no server watermark bridge/input-owner epoch exists. | M3 remains a code gap; persist/reconcile effects only with a canonical owner/bridge contract. |
| 48 | §5 placement/resource enforcement | Local reservations and two-phase resource primitives exist without canonical placement commit or OS-level resource enforcement. | M4 remains a code gap requiring scheduler/Runner integration and platform policies. |
| 49 | §6–8 driver, checkpoint, Cloudflare and stream | Checkpoint store and stream/receipt primitives exist; trusted registration, ACP/provider adapter, Cloudflare session reconstruction, reconnect/revocation server path are absent. | M5–M7 remain code gaps; no safe adapter can be registered without owning provider/trust APIs. |
| 50 | §9 Task Control projection | Tenant/requester-safe DTO reports `unknown` and omits location/recovery phase; persisted schema has no authoritative location/recovery-phase field. | UI cannot safely invent these values. Add the authoritative projection contract and persistence before rendering them. |
| 51 | §10–11 commercial and integration | Spec 280 grant/revocation/evidence API is absent; no full PostgreSQL race, browser, multi-platform, provider, or production certification evidence is present. | Commercial code remains blocked on Spec 280. Certification is an evidence gate, distinct from code completeness. |

Result: the receipt-projection ledger inconsistency is fixed. The remaining implementation gaps are real cross-component code work and dependency-owned interfaces, not test/product-readiness claims. No unsafe shortcut was applied to manufacture closure.
