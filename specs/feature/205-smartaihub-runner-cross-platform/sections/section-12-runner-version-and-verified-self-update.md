# Section 12 — Runner Version and Verified Self-Update

## Goal

Add a real Runner version contract and a durable, authenticated local update
path with drain, hash/signature verification, atomic replacement, restart
confirmation and rollback. Shared Container rollout remains Feature 204's
responsibility.

## Ownership and files

- `apps/runner-app/Cargo.toml`
- `apps/runner-app/Cargo.lock`
- `apps/runner-app/src/main.rs`
- `apps/runner-app/src/config.rs`
- `apps/runner-app/src/diagnostics.rs`
- `apps/runner-app/src/update.rs`
- `apps/runner-app/src/lib.rs`
- `apps/web/server/services/runnerContracts.ts`
- `apps/web/server/services/runnerAuthService.ts`
- `apps/web/server/services/runnerUpdateService.ts`
- `apps/web/server/routes/runnerControl.ts`
- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/0337_runner_update_commands.sql`
- focused Rust/server route/service tests

## Version contract

Expose `smartaihub-runner version` and include `runnerVersion` plus build
target/contract version in the redacted status and capability snapshot. Local
builds fall back to Cargo package version; release builds set an explicit
`SAH_RUNNER_BUILD_VERSION` at compile time so the workflow input and binary
report match.

Extend the additive Runner capability snapshot type; legacy snapshots without
the field remain valid and normalize to `null`.

## Durable command contract

Add `runner_update_commands` as a control command state table, not a second Job
ledger. It stores tenant, runner, release asset, idempotency key, requested
phase, status, actor, timestamps, last error and completion/rollback data.

Browser/session endpoints:

- `POST /api/runners/:runnerId/update` chooses a compatible published release,
  enforces tenant ownership/admin authority, rejects duplicate active updates
  and returns the existing command for the same idempotency key.
- `GET /api/runners/:runnerId/update/:commandId` returns a tenant-safe command status.

Runner-authenticated endpoints:

- `GET /api/runners/:runnerId/update-commands/next` requires
  `runner:update`, runner scope and local device proof where applicable;
- `GET /api/runners/:runnerId/update-commands/:commandId/download` streams only
  the assigned raw update binary;
- `POST /api/runners/:runnerId/update-commands/:commandId/ack` advances an
  allowed state idempotently and rejects regressions or foreign commands.

Add `runner:update` to the default control token scope and retain the existing
Runner audience/device-proof boundary. Do not accept Worker tokens or browser
session tokens at Runner command endpoints.

## Runner update state machine

Implement `update.rs` pure functions first: SHA-256 verification, RSA-SHA256
signature verification using the pinned public key format, backup naming,
same-filesystem atomic replacement and rollback cleanup. Then wire the local
refresh loop to poll one queued command, report phases, drain the supervisor,
download to a bounded temporary path, verify before replacement, and spawn a
copied post-exit helper. The helper must run from a sibling copy (not the
currently running image) so Windows can release the executable lock before
replacement; it then restarts the new binary and confirms authenticated health.
Permission failures and active jobs become explicit deferred states.

The updater must never overwrite the running executable in place. It writes a
temporary sibling, copies the current binary to a sibling helper, exits the
original process, then the helper atomically renames the current executable to
a backup, renames the verified file into place and restores the backup if the
restart health confirmation fails. The same helper contract is used on Windows,
macOS and Linux.

## TDD steps

1. Add Rust tests for version output, hash match/mismatch, signature policy,
   traversal/target rejection, atomic replacement and rollback.
2. Add server tests for scope/tenant/device authorization, idempotency,
   command ordering, release withdrawal and duplicate acknowledgements.
3. Implement shared types and migration/service before route wiring.
4. Implement Runner version and pure update primitives, then integrate the
   bounded refresh loop.
5. Run focused Rust tests and focused Runner server tests after each boundary.

## Acceptance

- Current and latest versions are server-comparable without parsing UI text.
- A connected Runner can receive exactly one update command and acknowledge it
  through terminal success or rollback.
- Hash/signature failures leave the current binary untouched.
- Active work is not silently killed; drain/defer state is observable.
- Replayed browser requests, Runner acks and restart recovery are idempotent.
- Container manifests never enter the local binary replacement path.
