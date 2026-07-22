# Section 01 - Device-code runtime

Ownership:

- `apps/worker-app/src-tauri/src/hermes_executor.rs`
- focused Rust tests in the same module

TDD:

- Reproduce URL-first/code-second output.
- Assert the URL-only callback emits nothing.
- Assert the code line produces exactly one structured event.
- Assert no raw field or log contains the code.
- Verify Windows uses `CREATE_NO_WINDOW`.

Acceptance:

- Parser waits for complete structured data.
- Other Hermes control/media invocations still capture stdout/stderr.
- Non-Windows behavior is unchanged.
