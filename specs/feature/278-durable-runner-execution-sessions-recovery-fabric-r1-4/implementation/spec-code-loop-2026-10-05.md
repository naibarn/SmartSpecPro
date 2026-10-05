# Spec 278 implementation comparison — 22-round loop

Date: 2026-10-05. This pass re-opened the normative AC/milestone text and current source, instead of relying on the earlier round report. Each round records the source comparison and the concrete remaining block. “PASS” only means the narrow local invariant has code and passing local evidence; it does not imply AC/milestone completion.

## 1. Contracts and dark projection — M0 / AC-12, 14, 15, 40

Compared the state/transition contracts, feature flag, worker-job authority and session/event schema. The flag-off path has a dedicated test and `worker_jobs` remains canonical. Event revisions and attempt/fence columns exist. **Partial:** migration not applied, projection writer has no runtime producer, protocol compatibility negotiation is absent, and no aligned 0387 snapshot is recorded. `drizzle-kit check` passes after repairing the malformed `0149_snapshot` policy object, but a generate trial exposes broad existing schema drift.

## 2. Local Session Host — M1 / AC-01, 09, 10, 18, 20, 29, 33

Compared registry/process source and tests against Worker restart survival, PID identity and OS containment criteria. Added and integration-tested a separate Linux Session Host with PTY, authenticated UDS attach, protected descriptor and host/child process identity, process-group termination and durable terminal receipt. **Open:** the host launcher is not called by canonical Worker start/recovery flow; Windows Job Object/ConPTY, macOS, signed helper provisioning and same-user workload isolation are unproven.

## 3. Recovery and authority — M2 / AC-02..04, 07..08, 15..17, 24, 31..32, 40

Compared grant verification and DB adoption helper against authenticated inventory, reconciliation, expiry and linearizable recovery. The helper locks canonical job before session and checks attempt/fence/revision/authority epoch; no mutation grant is emitted. **Open:** authenticated inventory/caller, host binding, grant issue/rotation, expiry enforcement, approval/cancel recovery, suspend handling, and competing PostgreSQL transaction proof. The local helper is not a completed recovery protocol.

## 4. Commands, input and update — M3 / AC-05..06, 19, 21..22, 35, 38, 40

Compared journal sequence/idempotency and authority checks to actual execution wiring. The Linux host bridges authenticated sequenced input to its PTY and rejects payload-changing idempotency reuse; the generic command lane also persists replay receipts. **Open:** no canonical Session Manager bridge, command-lane persistence across host crash, durable start dedupe, exclusive input-owner epochs, update/rollback drain or workspace generation lock.

## 5. Terminal stream — M3/M7 / AC-18..19, 30, 36

Compared output spool and receipt journal to reconnect, watermark, replay and server dedupe requirements. The Linux host supports authenticated local client reconnect and bounded in-memory PTY replay; it persists a terminal digest receipt. **Open:** no durable scrollback, control-plane reconnect/resync transport, delivered terminal outbox, or server dedupe/reconciliation caller.

## 6. Resource admission — M4 / AC-23, 37

Compared capability freshness and reservations to shared placement and hard enforcement. Local ledger validates freshness and preserves committed reservations after reopen. **Open:** no server placement transaction, cross-process contention proof, or measured OS RAM/disk/VRAM enforcement; reservation remains distinct from enforcement.

## 7. Driver trust and checkpoints — M5 / AC-25, 34, 39

Compared driver interface, trust allowlist and checkpoint validation to registered binary provenance and committed restore. Contract validators reject self-asserted trust; a bounded, atomic content-addressed local checkpoint store now survives reopen and validates scope/digest/lineage. **Open:** no deployed registry/provisioning or rotation, actual ACP adapter, revocation feed, or provider-backed tamper/restore proof.

## 8. Cloud continuity — M6 / AC-13, 25

Compared provider adapter surface to Cloudflare container/sandbox lifecycle semantics. Existing Cloudflare job transports are not session adapters, and implementation makes no process-persistence claim. **Open:** no session reconstruction/checkpoint adapter and no provider evidence.

## 9. Task Control — M8 / AC-14, 26

Compared safe projection and UI against fresh liveness plus canonical authority requirements. Tenant/requester-scoped DTO stays `unknown`; UI banner explicitly states unverified and suppresses internal IDs. Targeted page test covers this. **Open:** no positive recovered/running state, location/recovery phase, browser/keyboard/viewport evidence. Meaningful recovery UI is not complete.

## 10. Commercial, certification and verification reconciliation — R1.4 AC 1..15 / Tier A..E

Compared commercial requirements and rollout matrix to current code/evidence, and reconciled verification docs with latest run. **Open:** Spec 280 grant/revocation/usage integration and all certification tiers lack implementation/evidence. Earlier combined focused Web suite passed 147 tests in 7 files; the origin/main candidate passes the focused session contract/service/protocol/migration tests (19) and inventory route test (1). Drizzle chain check passes on the earlier candidate; migration numbering was subsequently reconciled to 0387 and its focused test passes. Latest full Runner run on the prior worktree passed 126 library tests and 6 Linux Session Host integration tests; origin/main candidate `cargo check` passes. No typecheck, migration application, production/browser/provider validation. Broad snapshot generation catch-up remains unresolved rather than folded into this task.

## Changes from this pass

- Reconciled stale test counts and stale migration-check history in `implementation/traceability.md` and Section 01 record.
- In the preceding pass, rechecked all section boundaries and left runtime/provider/cross-spec gates open. This continuation implemented the Linux Session Host/PTY slice and recorded its remaining integration/platform limits.
- Verified the migration checker again after the narrow snapshot shape correction; it reports `Everything's fine`.
- Added Unix no-follow and bounded-read handling to `Journal::load`; its symlink regression remains in the passing library suite.
- Completed 15 distinct spec-to-source review rounds (the 12 AC-focused rounds plus journal-load, durable-checkpoint-store, and Linux Session Host runtime reviews in `spec-compliance-12-rounds.md`). Updated evidence and preserved unresolved integration gates as OPEN.
- Rounds 16–17 added the authenticated server inventory observation path, strict bounded protocol validation, and lock-order audit. They did not close the Runner producer/host binding or adoption caller gaps.
- Rounds 18–19 added a bounded Linux startup inventory producer, startup queue drain, authenticated HTTP route coverage, and batch-level acknowledgement semantics. Session Host manifest registration and cryptographic host binding remain open.
- Round 20 aligned Rust numeric bounds with JavaScript parsing and reran the complete Runner package suite plus the inventory route regression.
- Round 21 added Session Host-to-registry registration and verified Host identity, then audited process cleanup. Canonical Worker invocation and cryptographic host-origin verification remain open.
- Round 22 proved registry-conflict rollback and fixed explicit checkpoint-store lock release after the parallel suite exposed a reopen lock failure.

## Final state

The local slices have targeted evidence, but implementation remains incomplete across M1–M8 and R1.4 integration. Do not label Spec 278 complete, production-ready, or beta-ready. See `traceability.md` for requirement-to-code pointers and external proof gates.
