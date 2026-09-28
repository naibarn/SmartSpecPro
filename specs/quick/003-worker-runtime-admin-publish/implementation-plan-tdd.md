# TDD plan

1. Shared/service tests: validation accepts the complete fixture, rejects missing Whisper/model, placeholder signature, path traversal, mismatched manifest/runtime id, and duplicate active release.
2. Route tests: admin can presign/finalize/publish; non-admin gets 403; unpublished artifacts are hidden; public manifest returns only published durable artifact; partial Windows/macOS catalog is represented correctly.
3. Storage tests: invalid storage prefix, hash mismatch, missing object, cleanup, and download range behavior.
4. UI tests: admin-only visibility, upload form, validation checklist, disabled Publish, pending macOS card, success refresh, and error recovery.
5. Worker App regression: typecheck plus existing Rust runtime manifest tests; verify endpoint 404/availability copy and render fail-closed state.

Expected proof commands:

- `npm --workspace apps/web test -- server/routes/__tests__/workerRuntime.test.ts --run`
- focused runtime release service/route/UI Vitest tests
- `npm --workspace apps/worker-app run typecheck`
- `cargo test --manifest-path apps/worker-app/src-tauri/Cargo.toml --test runtime_manifest_tests`
- `git diff --check`
