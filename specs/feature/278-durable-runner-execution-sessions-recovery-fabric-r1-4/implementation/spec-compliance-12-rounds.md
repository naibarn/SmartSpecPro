# Spec-to-code compliance review — 15 rounds

Date: 2026-10-05. This is a second pass focused specifically on the normative Spec 278 AC/milestone text. Each round compared requirements with source behavior and available evidence. Fixable source/test/migration-check gaps were fixed in the corresponding round and verified. A green local test cannot close missing runtime, PostgreSQL-race, provider, browser, or certification evidence.

## Round 1 — M0 and compatibility (`AC-12`, `AC-14`, `AC-15`, `AC-40`)

- **Spec check:** shadow projection must be default-off, cannot change canonical job state, and transitions must be revision fenced; a driver lifecycle contract is required.
- **Code check:** `runnerExecutionSessionService.ts` gates create/transition/read/adoption on `SMARTAIHUB_SPEC278_SESSION_PROJECTION === "true"`; `workerJobs` remains canonical. Added an inert-by-default test proving all four service entry points avoid DB access while disabled. Added the provider-neutral `SessionDriver` interface.
- **Evidence:** focused Web tests pass; migration tests cover the added attempt/fence columns and journal entry.
- **Result:** local M0 contract slice PASS. Runtime projection writer caller, compatibility negotiation and production shadow sample remain OPEN.

## Round 2 — Local process/registry (`AC-01`, `AC-09`, `AC-10`, `AC-18`, `AC-20`, `AC-29`, `AC-33`)

- **Spec check:** a separate host must outlive Worker restart, preserve process identity, quarantine corruption, protect control state and persist terminal receipts; both OS families require real-process evidence.
- **Code check:** registry is bounded/checksummed/locked, rejects control-root symlinks and path-like workspace refs, and quarantines corrupt records. Added Linux process-group cancellation and a real shell/child-process regression test.
- **Evidence:** Runner package suite: 114 passed; `process::cancellation_terminates_a_real_descendant_process` passed on this Linux host.
- **Result:** registry primitives and Linux descendant termination PASS locally. Durable host/PTY/ConPTY/IPC, PID start-identity verification, terminal-exit receipt caller, same-user tamper isolation, Windows Job Object and restart/reattach proof remain OPEN.

## Round 3 — Recovery authority and linearizability (`AC-02`, `AC-03`, `AC-04`, `AC-15`, `AC-31`, `AC-40`)

- **Spec check:** inventory must be authenticated, reconciled to canonical attempt/fence/revision, and adoption must have one winner across control-plane instances.
- **Code check:** added `adoptExecutionSessionProjection`, which locks `worker_jobs` before the session, checks tenant/job/attempt/fence/live lease/revision/authority epoch, enters `recovering`, advances epochs and appends an audit event. Grant verification checks signed scope, minimum epochs/revision, effect class, safety feature allowlist and expiry.
- **Evidence:** source-level transaction/CAS review and focused service syntax/test load; no PostgreSQL integration environment was used.
- **Result:** adoption CAS helper exists but no authenticated inventory endpoint/caller, host-origin binding, issuance handshake or two-connection race proof exists. AC-31 remains OPEN; helper does not grant mutation authority.

## Round 4 — Commands, input and output (`AC-05`, `AC-06`, `AC-19`, `AC-30`, `AC-35`, `AC-36`)

- **Spec check:** start must dedupe, commands and input must be ordered/replay safe, output bounded, critical receipts delivered at least once without starving control.
- **Code check:** local command journal enforces sequence/idempotency and stale authority/revision checks; input authority persists owner epoch; output spool is memory-bounded with truncation sequence; critical receipts use a separate locked durable Journal.
- **Evidence:** Runner package suite covers command replay, input takeover rejection, receipt persistence/ack and output truncation/pressure.
- **Result:** primitives PASS locally. No actual command-to-PTY writer, single-owner enforcement at the process boundary, terminal tombstone/server dedupe/outbox reconciler or reconnect transport exists. AC-05/30/35 remain OPEN end-to-end.

## Round 5 — Pending approval, cancellation and expiry (`AC-07`, `AC-08`, `AC-16`, `AC-17`, `AC-24`, `AC-32`)

- **Spec check:** approval/cancel survive restart; grants stop effects on expiry/revocation even without new commands; monotonic deadlines remain safe across suspend.
- **Code check:** local signed grants have bounded duration and `Instant`-based expiry with rollback/discontinuity rejection. No Session Host consumes the deadline or connects cancel/approval decisions to the canonical job control path.
- **Result:** verifier/deadline primitive PASS in tests. Pending-approval recovery, stale-session quiesce, child-process credential/effect revocation, suspend/resume callback and cancellation reconciliation remain OPEN.

## Round 6 — Update and workspace exclusion (`AC-11`, `AC-21`, `AC-22`, `AC-38`)

- **Spec check:** upgrades must reattach/rollback without stranding hosts; stale workspace writers must be excluded; missing safety features fail closed as incompatible.
- **Code check:** existing Runner binary update tests cover atomic replacement/hash/signature rollback, but the new session modules do not participate in update drain, compatibility negotiation or workspace-generation locking.
- **Result:** baseline updater coverage is not session-aware proof. AC-11/21/22/38 remain OPEN; no update path was changed in this pass.

## Round 7 — Resource placement (`AC-23`, `AC-37`)

- **Spec check:** fresh capability snapshot plus atomic local admission, committed reservations survive prepare TTL, and reservation is distinct from enforced limits.
- **Code check:** local ledger validates snapshot TTL and keeps committed capacity reserved after reopen; enforcement fields are represented separately. Earlier review fix prevents active committed reservations from disappearing after prepare expiry.
- **Evidence:** Runner resource tests, including reopen/expiry regression, pass.
- **Result:** local ledger PASS. No canonical server placement prepare/commit, measured host inventory, OS memory/disk/VRAM limit or independent enforcement provenance exists. AC-23/37 remain OPEN for deployment.

## Round 8 — Driver trust and checkpoints (`AC-25`, `AC-34`, `AC-39`)

- **Spec check:** binary provenance is deployment-rooted; checkpoint restore requires committed content digest, tenant/job/session/workspace scope and lineage.
- **Code check:** certificate data cannot self-assert trust; a deployment allowlist matches driver/version/source digest. Restore validates commit, scope, content digest, lineage and artifact refs.
- **Evidence:** Runner driver/checkpoint contract tests pass.
- **Result:** validator contracts PASS. No actual trusted driver registry, durable checkpoint commit store, signature/rotation provisioning, ACP adapter or tamper/restore integration test exists. AC-25/34/39 remain OPEN beyond unit contract.

## Round 9 — Cloud execution continuity (`AC-13`, provider-dependent `AC-25`)

- **Spec check:** Cloudflare replacement reports reconstruction/checkpoint continuity and must not inherit process persistence.
- **Code check:** existing Cloudflare adapters are job transports. No session driver maps Container/Sandbox lifecycle to session checkpoint/reconstruction; no new continuity claim was added.
- **Result:** no false `PROCESS_PERSISTENT` session claim exists, but M6 is not implemented and AC-13/25 remain OPEN. Live provider evidence is absent.

## Round 10 — Task Control (`AC-14`, `AC-26`)

- **Spec check:** do not say “running/recovered” without fresh liveness plus canonical authority; show useful safe status and preserve feature-off fallback.
- **Code check:** scoped detail DTO is optional and redacted. Added an Astryx Banner in Task Control that reports “Session status unverified” in Thai/English, displays no private session/driver IDs, and appears only when the flag produces a projection.
- **Evidence:** `RenderJobsPage.test.tsx` verifies the unknown banner, absence of “Recovered”, and hidden private identifiers; the 20 page tests pass.
- **Result:** safe unknown/fallback UI PASS. Location, continuity details, recovery phase, safety pause, meaningful positive recovery state and viewport/browser/keyboard proof remain OPEN because no trusted live evidence exists.

## Round 11 — GC and scaled recovery (`AC-27`, `AC-28`, `AC-30`, `§73A`)

- **Spec check:** unreconciled sessions/workspaces are GC protected; recovery is batched and jittered; critical events are deduped and reconciled.
- **Code check:** local event receipts are durable, but no session inventory scanner/recovery scheduler or session-aware GC guard is connected to the existing job control plane.
- **Result:** OPEN. No safe local substitute can prove these control-plane behaviors.

## Round 12 — Commercial R1.4, certification and migration proof

- **Spec check:** R1.4 AC 1–15 require Spec 280 grant/revocation authority, pinned release/lineage, durable usage evidence without Runner balance mutation; §67A needs tier-specific real evidence.
- **Code check:** no commercial binding/grant/usage implementation exists. No tier A–E evidence has been produced.
- **Migration follow-up:** `drizzle-kit check` initially found a malformed `policies: []` value in the new table entry in `0149_snapshot.json`; corrected it to the schema-required map form, after which `drizzle-kit check` passed. A generate experiment proposed a 638 KB unrelated schema catch-up across 595 tables; those temporary generated files were removed, and the broad drift was not mixed into Spec 278.
- **Result:** local migration-chain checker PASS. Snapshot-to-live-schema baseline drift remains a repository-level gate; R1.4 and certification remain OPEN.

## Round 13 — Journal load path integrity and bounded reads

- **Spec check:** recovery control state must fail closed on symlink/path substitution and remain bounded when loading local durable state.
- **Code check:** `Journal::persist` already used random `create_new` temp files with no-follow. `Journal::load` still used `fs::read`, which followed a symlink and read an unbounded file before applying the configured byte limit. Changed loading to open with `O_NOFOLLOW|O_CLOEXEC` on Unix and read at most `max_bytes + 1`; added a symlink rejection regression test.
- **Evidence:** `cargo fmt --manifest-path apps/runner-app/Cargo.toml -- --check`, complete Runner package suite (125 passed), and `git diff --check` all pass.
- **Result:** local journal load hardening PASS. Parent-directory replacement races, Windows reparse-point semantics, and end-to-end host ownership remain OPEN.

## Round 14 — Durable checkpoint commit store (M5 / AC-25, AC-34, AC-39)

- **Spec check:** checkpoint restore requires immutable committed content, canonical scope, byte digest, lineage, bounded storage and crash-safe durability.
- **Code check:** added a local content-addressed `CheckpointStore` with an exclusive store lock, 64 MiB per-checkpoint/1 GiB aggregate/2048-manifest quotas, 0600 files and 0700 root on Unix, no-follow reads, fsynced temp files atomically installed without clobbering via hard link, and restore scope/digest/lineage validation.
- **Evidence:** three focused tests pass: close/reopen with exact bytes, cross-tenant rejection, ID reuse rejection, tamper rejection and symlinked-root rejection.
- **Result:** local durable checkpoint storage PASS. Provider adapters, deployment registry/provenance, revocation and provider certification remain OPEN.

## Round 15 — Linux Session Host runtime and reconnect proof (M1/M3 / AC-01, AC-05, AC-09..10, AC-18, AC-20, AC-29, AC-33)

- **Spec check:** Worker restart must not terminate the exact local execution process; authenticated attach must bind session/generation, verify process identity, preserve bounded output and leave a durable terminal receipt before host exit.
- **Code check:** added a standalone Linux `smartaihub-session-host` binary. It creates a PTY and process session, controls the child process group, serves token/session/generation-bound UDS IPC, persists a mode-restricted descriptor with host/child PID start identities, relays bounded output, deduplicates sequenced PTY writes by payload digest, and writes a terminal receipt before exiting. SIGTERM escalates to SIGKILL after a bounded grace interval.
- **Evidence:** full Runner suite passes 125 library tests plus 4 Linux real-process integration tests covering reconnect to the same PID, PTY input/output, descriptor reload and process identity verification, wrong token/stale identity rejection, idempotent replay/conflict, symlinked root rejection, graceful termination, forced process-group kill and terminal receipt.
- **Result:** Linux local host/reconnect slice PASS. This does not prove existing Worker-flow integration, Session Host crash recovery, durable command dedupe across host restart, scrollback persistence/resize, macOS/Windows behavior, or host binary provenance; those remain OPEN.

## Round 16 — Authenticated recovery inventory observation (M2 / AC-02..04, AC-07..08, AC-16..17, AC-24, AC-31..32)

- **Spec check:** inventory is untrusted and bounded. Only the authenticated current Runner may report; server must reconcile tenant/job/attempt/lease/fence/generation/authority/placement/control revisions before recording, and observation must not itself grant adoption authority.
- **Code change:** added bounded exact-shape inventory validation; WSS and HTTP control endpoints use `runner:heartbeat` scope and bind the reporter session ID to the verified token. Added a feature-gated observer that locks canonical job then session, rejects stale/terminal/expired fences, idempotently records a `recovery_inventory_observed` event and never changes session state.
- **Evidence:** inventory contract + projection service focused tests pass (5 tests). Runner control suite: 21 passed, 1 failed because the existing credential-refresh route returned 503 instead of expected 200; no tests reached for the inventory route itself. `git diff --check` passes.
- **Result:** authenticated server observation path is implemented locally; producer, host-origin binding, adoption caller, mutation grant lifecycle, cancellation/approval reconciliation, terminal outbox and PostgreSQL concurrency proof remain OPEN. Section 03 stays PARTIAL / BLOCKED.

## Round 17 — Adversarial protocol and lock-order review (M2 / AC-02..04, AC-16..17, AC-24)

- **Spec check:** reject oversized/duplicate/extra-field inventory, bind reporter identity to verified token, and prevent event-sequence races/deadlocks with all session writers.
- **Code check:** protocol permits the bounded inventory message; the strict inventory contract rejects duplicate session IDs, extra fields and >64 records. Observer and existing create/transition/adopt helpers all take canonical job before session; event writes occur under that job lock. Inventory writes only `observedAt` and an append-only event.
- **Evidence:** three focused Vitest files pass (16 tests); `git diff --check` passes. Runner control suite has 21 passing and one refresh-route 503 failure; it has no direct inventory-handler exercise.
- **Unclosed gap:** Rust `SessionRegistry` is still not opened by the Runner startup/keepalive path and therefore emits no inventory; host-origin binding and end-to-end stale host proof remain absent. No DB concurrency test was run.

## Round 18 — Runner registry inventory producer and bounded startup drain (M2 / AC-02..04, AC-16..17, AC-24)

- **Spec check:** only live local processes matching this Runner may be reported; protocol bounds must cover maximum local inventory, and startup cannot silently discard reconciliation events.
- **Code change:** Linux Runner startup now reads `SessionRegistry`, verifies child PID/start-tick/boot identity, filters malformed job/session/state identities, emits batches no larger than 64 records, and queues every batch. Startup now drains its finite queue and refuses to enter the live run loop if required events remain undelivered.
- **Evidence:** full Runner suite passes: 126 library tests + 4 Linux Session Host integration tests. New test exercises 65 records -> 64 + 1 and excludes malformed job identity. `cargo fmt --check` passes.
- **Unclosed gap:** the standalone Session Host launch path still does not write `SessionRegistry`; thus the producer has no live records until a canonical caller registers them. No host-origin cryptographic proof or periodic inventory refresh exists.

## Round 19 — Inventory endpoint auth and batch outcome semantics (M2 / AC-02..04, AC-16..17, AC-24)

- **Spec check:** reporter session mismatch must fail before persistence. Row-level stale candidates are per-record rejections and must not cause transport replay of a fully processed batch.
- **Code change:** inventory endpoint now acknowledges a successfully processed envelope as applied even when the result contains stale/rejected rows, while returning per-row counts. Added HTTP route coverage for token/session binding, stale-row acknowledgement, and mismatch denial before service invocation.
- **Evidence:** direct inventory route test passes; focused Web set reports 38 passed. The full route file reports 22 passed and one credential-refresh 503 failure outside inventory. `git diff --check` passes.
- **Result:** authenticated end-to-end transport from Runner startup producer to server observer is wired locally. It does not prove the current host launch path writes manifests, adoption, DB race behavior, or production operation.

## Round 20 — Cross-language bounds and final inventory transport regression (M2 / AC-02..04, AC-16..17, AC-24)

- **Spec check:** Rust `u64` watermarks must remain exact in JavaScript, and inventory size must honor both protocol record limits and durable Runner queue behavior.
- **Code check:** producer now excludes revisions above `Number.MAX_SAFE_INTEGER`, validates UUID/session/state fields to match the TypeScript parser, chunks the 2,048-record registry ceiling into 64-record batches, and drains all startup events before entering the live loop. Route ack distinguishes per-record rejection from batch delivery.
- **Evidence:** Runner full suite passes 126 library + 4 Linux process integration tests; Web inventory HTTP/WSS route test passes in isolation. Combined Web suite has 38 passing tests and one existing credential-refresh 503 failure; `git diff --check` passes.
- **Remaining:** standalone Host launch has no manifest writer, so no real Host session currently populates this registry. Adoption, cryptographic Host proof, database race test and external proof gates remain open.

## Round 21 — Session Host registration, verified host identity and process cleanup (M1/M2 / AC-01..04, AC-09..10, AC-18, AC-20, AC-24, AC-29)

- **Spec check:** the standalone Host and owned child must share the same durable registry identity; inventory must reject a reused/dead Host or child PID, and a registry write failure must not leave an undiscoverable execution process.
- **Code change:** added `launch_registered` to validate Host/child processes, persist the session and canonical job fence to `SessionRegistry`, and terminate/remove the attach descriptor on failure. Registry manifests now optionally persist Host identity; verified inventory checks both identities. Server contract requires both process identity shapes, and event evidence retains both. Startup emits only registered entries with Host identity.
- **Evidence:** full Runner suite passes 126 library tests + 5 Linux real-process integration tests, including registered Host+child identity inventory. Focused Web inventory route passes; contracts/service/protocol tests pass 16. `cargo fmt --check`, `git diff --check` pass. Integration-test cleanup now sends the next valid command sequence and waits for Host exit; post-run process audit finds no orphan Host/child.
- **Remaining:** `launch_registered` is not yet called by canonical Worker session start, so existing Runner executions are not registered automatically. Host identity digests are locally verified but server does not cryptographically authenticate Host origin. Adoption/grant lifecycle, cross-process DB race, revocation and platform/provider gates remain OPEN.

## Round 22 — Durable store lock release and registration rollback regression (M1/M2/M5 / AC-02..04, AC-24..25, AC-34)

- **Spec check:** reopening a durable checkpoint store after owner teardown must not remain spuriously locked, and registry identity conflict must leave no detached process or attach descriptor.
- **Code change:** `CheckpointStore::drop` explicitly releases its exclusive lock. Added a real-process registration-conflict test that verifies rollback terminates the Session Host and its terminal receipt is written.
- **Evidence:** full Runner suite passes 126 unit tests + 6 Linux process integration tests; checkpoint reopen regression now passes in concurrent suite. Web contracts/service/protocol tests pass 16 and the WSS/HTTP inventory route regression passes separately. Formatting/diff checks pass; process audit reports no test Host/child left behind.
- **Remaining:** canonical Worker caller, cryptographic host provenance, adoption/grant/revocation and production/provider gates remain open.

## Round 23 — Session Host registration contract parity (M1 / AC-01..04, AC-24, AC-29)

- **Spec check:** local Host registration must match the bounded inventory contract so an invalid manifest cannot start an unmanaged durable process.
- **Finding/fix:** `launch_registered` previously checked only nonempty registration fields, while server inventory requires UUID job IDs, safe identifiers, allowed continuity values and JS-safe revisions. Added full pre-spawn validation and a real integration regression proving invalid input creates no Host state directory.
- **Evidence:** `cargo test --manifest-path apps/runner-app/Cargo.toml --test session_host_integration` — 7 passed; formatting and diff checks pass.
- **Result:** pre-spawn contract mismatch CLOSED. Canonical Worker caller and server-authenticated Host provenance remain OPEN.

## Round 24 — Runner package regression sweep (M0..M8 / local code)

- **Review:** reran the complete Runner package after registry/checkpoint/authority/session additions to catch lock contention and cross-module regressions.
- **Evidence:** `cargo test --manifest-path apps/runner-app/Cargo.toml` — 126 library unit tests + 6 Linux real-process integration tests passed. After a final UUID-format tightening, all 7 integration tests passed again.
- **Result:** local Runner regression gate PASS; macOS/Windows, live Worker restart adoption, and provider gates remain OPEN.

## Round 25 — Web inventory trust boundary and contracts (M0/M2/M8)

- **Review:** checked server DTO validation, feature-off service behavior, authenticated inventory route binding, and stale-row acknowledgement against Runner-produced fields.
- **Evidence:** contracts/service/protocol tests — 16 passed; authenticated inventory route test — 1 passed; relevant filtered Web sweep — 5 passed. Full `runnerControl.test.ts` with a synthetic test-only JWT secret: 22 passed, 1 failed in the separate execution-credential refresh test (expected 200, got 503 from unavailable refresh storage). An initial run without the test JWT failed at module initialization; rerun with the secret reached the test suite.
- **Result:** inventory route and contract slice PASS. Credential-refresh failure remains isolated from session inventory behavior; no live PostgreSQL concurrency proof.

## Round 26 — Section and traceability reconciliation (11 sections)

- **Review:** compared section status text to callers, tests and artifacts; validated that the new registration writer is still a primitive and did not overstate feature completion.
- **Finding/action:** updated Section 02 and traceability with pre-spawn validation and current test counts. Kept all caller, grant, placement, provider, UI-browser and certification gates open where source/runtime evidence is absent.
- **Result:** evidence/status parity PASS for inspected sections; implementation remains PARTIAL with explicit blockers.

## Round 27 — Worktree and final local evidence integrity

- **Review:** verified isolated task branch, no accidental Web dependency symlink, clean diff whitespace, scoped final format check and no claims of production/deploy/migration completion.
- **Evidence:** `git diff --check`, `cargo fmt --check`, test summaries above, and `test ! -e apps/web/node_modules` pass. No commit, push, migration or deployment performed.
- **Result:** preservation and local evidence boundary PASS. Full feature cannot be certified from this worktree because external and unimplemented runtime gates below are outstanding.

## Round 28 — Full Runner control-route suite (M2 / inventory transport)

- **Review:** reran the complete changed route test file with its required synthetic test JWT to check collateral failures beyond the inventory-specific case.
- **Evidence:** 22/23 tests passed, including the new authenticated inventory route. The sole failure is the separate credential-refresh test (`expected 200, got 503`) because refresh storage is unavailable in this test environment; this matches the previously observed baseline and does not exercise session inventory.
- **Result:** session route regression PASS; unrelated credential-refresh test remains a baseline issue. The temporary test dependency symlink was removed and verified absent.

## Round 29 — Reconcile checkpoint against current `origin/main` (M0 / migration ordering)

- **Review:** isolated only the dirty Spec 278 delta on a fresh `origin/main` candidate after discovering the original task worktree was 48 commits behind and carried three unrelated commits.
- **Finding/fix:** the original migration filename `0383_spec278...` collided with current main's Spec 224 migration `0383` and entries through `0386`. Renumbered the Spec 278 migration to `0387`, appended journal index 373, and updated migration tests/traceability. Preserved current main's migration entries and existing modules/imports during three-way reconciliation.
- **Evidence:** candidate `cargo check` and format checks pass; focused Web contracts/service/protocol/migration tests pass 19; authenticated inventory route test passes 1; `drizzle-kit check` passes with a synthetic local `DATABASE_URL`; diff/journal JSON checks pass.
- **Result:** stale-base and migration collision CLOSED for the candidate. Promotion still requires the final exact staged diff and standard branch-protection path.

## Round 30 — Feature-gated M0 projection producer (AC-12, AC-14, AC-15, AC-40)

- **Review:** traced the canonical external-agent dispatcher and verified it has tenant/job/attempt/fence/runner/driver data while `createExecutionSessionProjection` already enforces the off-by-default flag and canonical job CAS.
- **Code change:** `externalAgentRunnerDispatcher` now derives a stable session ID from tenant/job/attempt/idempotency identity, creates an `ephemeral`/`COMMAND_ONLY` `starting` projection through the existing service, and stores the returned ID in durable external-wait metadata. Wait persistence failure moves the projection to unknown when possible; ambiguous command dispatch moves it to unknown before canonical external-wait failure. No execution path or canonical job authority is replaced.
- **Evidence:** focused dispatcher, session contract, projection-service and migration tests — 14 passed across 4 files. New tests cover stable projection metadata plus failed-wait and ambiguous-dispatch state handling. The canonical projection service's feature-off tests verify no DB access when disabled.
- **Result:** M0 runtime projection producer CLOSED for external-agent dispatch. Persistent Session Host start, receipt-driven projection updates, authority grant issuance and certification remain OPEN.

## Round 31 — Projection state versus terminal job ordering (AC-12, AC-15, AC-40)

- **Finding:** canonical `failExternalWait` moves `worker_jobs` to terminal `failed`; the projection transition service correctly rejects later state changes for terminal jobs. The first M0 implementation attempted `unknown` after that canonical transition, so the session row could remain `starting`.
- **Fix:** persist the best-effort `unknown` projection event before recording the canonical external-wait failure. For a `waitForExternal` persistence exception, record `unknown` rather than assuming the command was never persisted or dispatched. Added an order assertion.
- **Evidence:** dispatcher/session contract/projection/migration tests — 14 passed across 4 files after the fix and Prettier; `git diff --check` passes.
- **Result:** terminal-ordering gap CLOSED. Canonical job remains finality authority; session projection remains observational.

## Remaining blocks after 31 rounds

1. Canonical Worker invocation of the registered Linux Session Host and cryptographic host binding; grant issuance/rotation, host expiry enforcement, approval/cancel recovery and PostgreSQL adoption race proof.
3. Session-aware start dedupe, PTY input ownership, server event dedupe/reconciler, update/rollback negotiation and workspace writer exclusion.
4. Server placement, measured capability inventory and OS hard enforcement.
5. Registered provider/Cloudflare drivers and durable checkpoint commit storage.
6. Session-aware GC/recovery batching and reconnect transport.
7. Spec 280 commercial grant/evidence contract and certification matrix.
8. Browser viewport/keyboard evidence and repository schema/snapshot drift reconciliation.

All safe local issues discovered through 31 review rounds (including feature-off proof, local adoption CAS helper, Linux process-tree test, Task Control unknown-state notice, driver lifecycle interface, malformed-snapshot checker blocker, registration contract parity, checkpoint lock release, origin/main migration ordering, the M0 projection producer, and terminal-ordering behavior) were addressed. Remaining items are still implementation gates; the project must not be reported as fully implemented or beta-ready.
