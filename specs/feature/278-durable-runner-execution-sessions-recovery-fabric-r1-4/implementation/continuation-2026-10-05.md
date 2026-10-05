# Orchestra continuation — Spec 278

## Chosen route

Resumed the existing 11-section deep-plan rather than replanning an already specified feature. Created a dedicated `codex/spec278-durable-sessions` worktree from current HEAD and copied only existing Spec 278 source/tests/planning paths from the dirty checkout. No shared `orchestra/` state, other specs, SPaaS files, commits, pushes, migrations or deployments were changed.

## Closed code gaps in this continuation

1. **AC-10 local identity check:** `session_registry.rs` now captures Linux `/proc/<pid>/stat` start ticks and kernel boot ID, hashes the identity tuple, and verifies it before a `verified_process_inventory()` result can expose a record as eligible. Missing/reused/mismatched PIDs are excluded. Added tests for current process identity and stale metadata.
2. **AC-19 idempotent ack-loss replay:** `SessionCommandLane::accept` previously rejected a matching persisted command as stale when its original authority epoch had advanced. It now returns the existing, payload/sequence-checked durable receipt first; only unseen commands are tested against current authority. Added RED/GREEN regression coverage.
3. **Registry temp-file symlink:** registry persistence now uses a random exclusive temp filename and Unix no-follow/close-on-exec flags. Added a regression test proving a planted temp symlink cannot overwrite its target.
4. **AC-23 reservation idempotency:** committed commit retries now return the durable committed record after prepare expiry; released and expired prepare IDs cannot be replayed as successful reservations. Both regression tests failed before the fix.
5. **AC-34 checkpoint integrity:** restore validation now recomputes the canonical lineage digest and checks mandatory manifest identifiers/generations. A substituted checkpoint ID with a copied digest is rejected.
6. **AC-23 snapshot freshness:** future-dated capability snapshots now fail closed as stale rather than being accepted based only on a future expiry.
7. **AC-30/36 critical receipt lifetime:** acknowledged journal history is compacted while the latest ack ID/digest remains replay-safe; a 128-receipt loop stays bounded across reopen.
8. **Shared journal symlink safety:** `Journal::persist` now uses exclusive random temp files with Unix no-follow flags; the regression test plants the former predictable `.tmp` symlink and proves its target is unchanged.
9. **Journal load symlink and size bounds:** `Journal::load` now opens with Unix no-follow/close-on-exec and reads at most `max_bytes + 1` before classifying an oversized journal. Added a regression proving a symlinked control file is rejected.
10. **Durable checkpoint commit store:** added `CheckpointStore` with scoped content-addressed blobs, immutable manifests, a process lock, fsynced temporary writes atomically installed without clobbering, symlink/path checks, bounded read sizes and total-store quotas. Reopen, cross-tenant scope, manifest ID reuse, blob tampering and symlink-root tests pass. This is a local substrate and does not certify a provider.
11. **Linux Session Host/PTY:** added a separate `smartaihub-session-host` process, bounded PTY output, authenticated generation-bound UDS IPC, a protected persisted attach descriptor, host/child start-identity verification, sequenced input dedupe by payload digest, process-group TERM/KILL escalation and a durable terminal receipt. Integration tests reconnect via a reloaded descriptor to the exact child PID and cover auth, stale identity, symlink root, replay conflict and graceful/forced termination.

## Verification

- Runner package: 125 library unit tests and 4 Session Host real-process integration tests passed; format check and `git diff --check` passed.
- Web focused suite: 147 passed in 7 files. The isolated worktree lacks `node_modules`; all exact Spec 278 Web source/schema/test inputs were compared byte-for-byte with the dependency-enabled checkout before running.
- `drizzle-kit check`: passed.
- `git diff --check`: passed after the final code and record updates.

## Residual gates

These gates remain open: wire the Linux host launcher and reattach into canonical M2 inventory/adoption; make host command dedupe durable across host crash; persist terminal scrollback/resize and reconcile receipt through server outbox; add secure versioned helper provenance; implement/certify macOS and Windows Job Object/ConPTY; authenticate inventory/grant issuer and prove PostgreSQL adoption race; recover pending approval/cancel/expiry; implement upgrade compatibility/workspace exclusion; server resource placement/hard enforcement; trusted provider and Cloudflare adapters; Spec 280 commercial evidence; browser proof; Tier A–E certification. Broad migration snapshot/schema drift remains; production migration was not applied.

## Current task status

`implemented_with_deferred_gaps`. The ten concrete local fix groups above are implemented and regression-tested. M1–M8 integration and R1.4 feature completion remain incomplete; beta/production claims remain prohibited until their exact evidence gates pass.
