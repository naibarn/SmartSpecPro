# Section 02: Tauri export and lifecycle

## Ownership

`apps/worker-app/src-tauri/src/lib.rs`, `commands.rs`, and the worker loop.

## Tasks

- Mark a session active before normal work starts and mark clean exit on known
  close/update paths.
- Log panic and process/sidecar lifecycle evidence.
- Add a Tauri command that writes the merged export to a caller-selected path.
- Register the command and keep source paths internal to the app data dir.

## Proof

Cargo tests plus targeted source inspection confirm all intentional exit paths
are classified and no secrets are passed to the export command.
