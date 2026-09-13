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

## Speaker-aware runner

Feature 179 is backed by an operator-controlled native runner. A signed Windows
runtime may include `speaker-aware/speaker-aware-runner.exe`; a signed macOS
arm64 runtime uses `speaker-aware/speaker-aware-runner` without the `.exe`
suffix. The manifest's `speakerAwareRunner` entry must match that target path
and checksum. The Worker discovers the file automatically after installing the
runtime pack; `SMARTAIHUB_SPEAKER_AWARE_RUNNER` remains an explicit development
override. The runner must be built or obtained for the target Worker App host
and is passed to `npm run runtime:release` with `--speaker-aware-runner PATH`.

The macOS runtime ZIP is assembled from prebuilt Darwin arm64 inputs and never
uses WSL2. Its Remotion sidecar must carry the Darwin arm64 compositor, esbuild,
and rspack native modules; Linux or Windows native modules are not a substitute.
The HyperFrames launcher may be the approved POSIX wrapper, which invokes the
bundled Darwin arm64 Node binary directly.
