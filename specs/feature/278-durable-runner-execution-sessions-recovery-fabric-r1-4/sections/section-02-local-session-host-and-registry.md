# Section 02 — Local Session Host and Registry

## Goal and boundaries

Implement M1 for local-device Runner: a separate durable host owns a child process and PTY across Worker process restart. Session Host mechanics do not own scheduling, job completion, approval, billing, or lease renewal.

## Requirements

- Launch approved executables directly without shell interpretation. Introduce a host IPC protocol (UDS/Named Pipe) bound to session ID/generation and protected by OS ACL/permissions.
- Keep registry, manifests, attach credentials, journal and trust material outside mutable workspace. Canonicalize protected roots and reject symlink/junction/path alias substitution. Child cannot write control state at claimed enforcement level.
- Use crash-safe versioned registry transactions/atomic temp-write, fsync and rename, checksums, ownership lock, schema migration and corrupt-record quarantine. Store command/event watermarks and bounded dedupe receipts.
- Persist PID plus process start identity/boot ID (and platform identity where available); PID alone must never recover a session.
- Provide PTY/ConPTY adapter, attach/detach, bounded terminal state, process exit detection and OS process-tree containment. Use Unix process groups and Windows Job Objects/equivalent with explicit capability reporting.
- Persist durable terminal receipt and outbox before host exit. Receipt records process identity, session generation, exit/termination reason, time bounds, final fence/command/event watermarks, usage summary and output digests/refs. It never marks `worker_jobs` complete.
- Verify privileged Session Host binary provenance before use. Do not expose attach secrets in manifest/logs.

## Likely owned files

- `apps/runner-app/src/process.rs`, `journal.rs`, `supervisor.rs`, new `session_host.rs`, `session_registry.rs`, `session_manifest.rs`, `pty.rs`, platform modules and IPC modules.
- `apps/runner-app/Cargo.toml` only if an existing dependency cannot meet storage/PTY needs; justify each addition.
- `apps/runner-app/README.md` for supported continuity and OS requirements.

## Acceptance and tests

Cover AC-01, AC-09..11, AC-18, AC-20, AC-29, AC-33. Unit tests inject crashes around every durable boundary, corrupt/checksum records, secret serialization, path attacks, lock contention, PID reuse and quota behavior. Real process integration tests must show a Worker/client restart can reattach to a surviving host and that cancellation kills descendants on supported OS CI. Mock tests are not proof of AC-20.

## Dependencies

Requires Section 01 contracts. Produces local inventory/receipt behavior consumed by Sections 03, 04 and 08.

## Implementation record

- Added `session_registry.rs`: locked bounded registry, checksummed atomic replacement, process identity fields, monotonic command/event watermarks, and corrupt/symlink quarantine. `cargo test --manifest-path apps/runner-app/Cargo.toml session_registry` passed 3 tests.
- Updated Unix process cancellation to signal the dedicated process group, including descendants after the leader exits. This is not Windows Job Object containment and was not exercised by a dedicated child-process integration test.
- Added `session_command_lane.rs` and durable receipt storage in Section 04; these are local primitives and are not connected to process I/O.
- Follow-up completion pass: added Linux `/proc` PID start-tick + boot-ID capture and verification, and a `verified_process_inventory()` filter that excludes missing or mismatched process identities before recovery code can consume inventory. Runner package tests cover current identity and stale PID metadata rejection. This closes the local PID-reuse check only; no host or attach caller exists.
- Registry persistence now creates an unpredictable temporary file exclusively with Unix `O_NOFOLLOW`/`O_CLOEXEC` before atomic rename. A planted-symlink regression test verifies the target file is not modified.
- Added Linux `smartaihub-session-host` as a separate process. It launches approved absolute executables directly in a PTY, owns the process group, serves session/generation/token-bound Unix-socket IPC with mode `0600`, keeps a bounded 1 MiB output ring, sequences/idempotently acknowledges control input, and stores its attach descriptor at mode `0600` under a mode `0700` session root. A standalone integration test reloads the persisted descriptor as a new client, reattaches to the same child PID after discarding the original client, verifies PTY I/O and duplicate-command handling, rejects a wrong token/symlinked root, terminates the process group, and verifies a durable terminal receipt with process identity.
- The descriptor binds host and child PID start identities plus the Linux boot ID; descriptor load and client attachment fail closed on PID reuse or stale processes.
- The Host writes its terminal receipt with bounded output digest and final command watermark before exiting. It does not settle `worker_jobs`.
- Added `launch_registered`: after Host and child startup, it validates both process identities and writes their PID/start-tick/boot digests plus job attempt/fence, session generation, authority/placement/control revisions and workspace reference to `SessionRegistry`. If registration fails, the Host is terminated and its attach descriptor removed.
- Runner inventory only emits entries with a registered, still-live Host identity as well as a live child identity. The server receives both identities but does not independently authenticate the Host process cryptographically.
- A real-process integration test launches the standalone Host through `launch_registered` and verifies both identities in verified registry inventory. Test cleanup now waits for Host exit to prevent orphan test processes.
- Registration inputs are validated before Host spawn against the server inventory contract: UUID job ID, safe session/workspace references, allowed continuity values, bounded identifiers/version and JavaScript safe-integer revisions. A regression test proves invalid registration creates no Host state directory.
- Status: **PARTIAL**. The Linux registration/reconnect primitive has real-process evidence, but no canonical Worker start/recovery caller invokes `launch_registered`. Still open: durable command dedupe across a Session Host crash; durable bounded scrollback/terminal resize; secure versioned Host binary provisioning; macOS support; Windows ConPTY/Job Objects; and provider/production proof. AC-01/09/10/18/20/29/33 are not certified across supported platforms.
