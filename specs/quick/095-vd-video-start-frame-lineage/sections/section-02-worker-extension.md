# Section 02: Hermes Image Extension

## Ownership

- `apps/worker-app/src-tauri/src/hermes_executor.rs`

## Work

1. Add failing result-marker tests for supported image formats.
2. Introduce a pure magic-byte extension resolver aligned with validation.
3. Use the resolved suffix before writing downloaded image bytes.
4. Preserve `.mp4` handling and existing validation errors.

## Acceptance

- JPEG, PNG, WebP, and GIF use matching suffixes.
- Unsupported bytes fail closed.
- Rust unit tests and rustfmt pass.

## Implementation Notes

- HTTPS result-marker downloads now derive `.jpg`, `.png`, `.webp`, or `.gif`
  from validated magic bytes before writing the local artifact.
- WebP detection requires both the RIFF container marker and WEBP signature.
- Unsupported image bytes fail before any legacy `.img` artifact is written.
- Hermes executor tests: 51 passed. The changed hunks are rustfmt-clean; the
  crate-wide format check still reports unrelated formatting in the existing
  dirty Rust worktree.

## Risk

Do not modify upload/storage contracts or rename existing artifacts.
