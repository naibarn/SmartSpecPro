# Section 01: diagnostics core

## Ownership

`apps/worker-app/src-tauri/src/diagnostics.rs`

## Tasks

- Add crash/session marker lifecycle with atomic writes.
- Add panic hook and bounded backtrace/error text.
- Add redaction and merged export content helpers.
- Keep rotation and token-reference compatibility.

## Proof

Rust unit tests cover clean/unclean transitions, redaction, export order,
rotation, and failure-safe behavior.
