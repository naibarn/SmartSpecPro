# Remotion render asset staging and bounded media waits

## Problem

`OffthreadVideo` can download a complete remote media file before extracting a
frame. Its internal `delayRender` handle had a shorter default timeout than the
worker's ten-minute render attempt, so a slow storage proxy could fail a render
before the worker-level timeout was reached. Retries also re-ran manifest
verification without retaining the downloaded bytes.

## Decision

1. Set explicit media delay-render timeouts to the shared Remotion attempt
   timeout and disable nested media retries. The worker owns retry policy.
2. In the Remotion sidecar, download each HTTP(S) manifest source once into the
   per-job workspace, verify its SHA-256, and serve the staged files from a
   loopback HTTP server during rendering.
3. Rewrite only render-template media URLs to the loopback server. Keep the
   original URLs and hashes in the payload manifest for provenance and existing
   verification semantics.
4. Keep staged files and the local server alive across the existing sidecar
   retry loop; transient retries therefore reuse the same immutable inputs.
5. Keep the tracked sidecar and `runtime-pack` sidecar byte-identical.

## Failure and compatibility behavior

- Non-HTTP(S) manifest sources retain the existing skip behavior.
- A failed download, HTTP error, or hash mismatch fails closed as
  `asset_stage_failed` before Chromium starts.
- A media URL absent from the manifest is left unchanged, preserving legacy
  payload compatibility; the manifest remains the authoritative staging list.
- No database, queue, credit, or UI contract changes are required.

## Verification

- Focused sidecar tests cover staging, URL rewriting, and retry reuse.
- Generic composition typecheck covers the explicit Remotion media props.
- `node --check`, `git diff --check`, and `cmp -s` verify shipped script syntax,
  whitespace, and source/runtime-pack parity.
