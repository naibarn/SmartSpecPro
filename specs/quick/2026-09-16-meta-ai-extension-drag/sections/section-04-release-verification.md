# Section 4 — Release and verification

## Ownership

Version metadata, generated dist, and dashboard release ZIP.

Set all extension version declarations to `0.1.146`. Vite-build without the
standalone typecheck, create the versioned ZIP in the existing dashboard release
directory, validate package contents, and inspect the diff for unrelated paths.

## Acceptance

- `dist/manifest.json` and panel build report `0.1.146`.
- Dashboard ZIP exists and validator passes.
- ZIP contains manifest, panel, service worker, content, and dragBridge assets.
- `git diff --check` passes.

