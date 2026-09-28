# Section 02: Worker doctor

Ownership: managed WSL readiness and Rust regression fixture.

Target files: `apps/worker-app/src-tauri/src/commands.rs` and
`apps/worker-app/src-tauri/tests/runtime_manifest_tests.rs`.

TDD: the WSL fixture uses `whisper/whisper-cli`; missing transcription,
signature, or manifest contract must make the shell check fail.

Acceptance: the successful message names Whisper, large-v3, and signature
files; Python contract failures propagate to the final check status.
