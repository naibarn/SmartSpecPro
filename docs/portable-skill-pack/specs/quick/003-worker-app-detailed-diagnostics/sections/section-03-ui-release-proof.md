# Section 03: UI and release proof

## Ownership

`apps/worker-app/src/main.tsx`, package/version metadata, and Windows release
artifacts.

## Tasks

- Add diagnostics level selector and Download/Open folder buttons.
- Use the native save dialog and show the resulting destination/error.
- Bump to 0.1.199, build Windows installer, and verify release metadata.

## Proof

Frontend build, Cargo tests, installer existence/version checks, endpoint parity,
and `git diff --check` must pass.
