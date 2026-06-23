# Smart AI Hub Worker Runtime Pack

This folder is license-gated and now contains the official Smart AI Hub Worker
runtime pack metadata.

The Worker App may only claim HyperFrames render jobs when `manifest.json`
points to an allowed runtime pack with:

- the official HyperFrames sidecar binary for this Worker App build;
- a managed Chrome/Chromium browser runtime used by HyperFrames CSS/HTML rendering;
- FFmpeg and ffprobe binaries with redistributable license notices;
- bundled Thai font files and their license notice, or a documented system-font dependency;
- `SHA256SUMS`, `SHA256SUMS.sig`, and `THIRD_PARTY_NOTICES.txt`;
- exact versions and SHA-256 hashes in `manifest.json`.

`npm run runtime:pack` preserves an existing allowed pack and validates sidecar
hashes and license notice files. When this folder already contains an allowed
manifest, the release pipeline will keep it instead of reverting to the
placeholder pack.

`npm run release:windows` now accepts the official runtime pack and publishes
the worker installer once the runtime bundle checks pass.
