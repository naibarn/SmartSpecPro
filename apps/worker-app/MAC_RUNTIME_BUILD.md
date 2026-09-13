# Native macOS HyperFrames runtime pack

This manual assembles the runtime archive consumed by the macOS Worker App. It
is not the Hermes runtime. It is also not interchangeable with the
Windows/WSL2 runtime.

## Required identity

Every output must use exactly:

```text
runtimeId: hyperframes-macos-arm64
runtimePlatform: macos-arm64
architecture: arm64
```

The packager may run on Linux, macOS, or CI because it only assembles already
built target artifacts into a ZIP. It never executes or compiles those target
artifacts. Every native input must still be macOS Mach-O arm64; a Linux ELF,
Windows PE/.exe, WSL2 file, or Intel-only binary is rejected.

## Inputs

Provide native macOS arm64 versions of all of these. They may be downloaded or
copied to the Linux release host as pinned release inputs:

```text
sidecarPath       HyperFrames/Remotion native render sidecar or POSIX launcher
nodePath          Node 22+ executable
chromePath        Chrome for Testing or Google Chrome executable
headlessShellPath Chromium headless shell executable
ffmpegPath        FFmpeg executable
ffprobePath       FFprobe executable
whisperPath       whisper.cpp CLI plus its bundled libwhisper/ggml/OpenMP dylibs
```

For a portable Mac ZIP, the Whisper dylibs must be next to the input CLI under
`whisper/lib/`, and the FFmpeg dylibs must be next to the input `ffmpeg` and
`ffprobe`. The packager copies both dylib bundles into the final runtime, so
the Worker App does not depend on Homebrew, WSL2, or a host-installed library.

The HyperFrames dependency tree must contain the production dependencies used
by the sidecar, including the Darwin arm64 Sharp/libvips packages:

```text
node/bin/node
hyperframes/node_modules/sharp/
hyperframes/node_modules/@img/sharp-darwin-arm64/
hyperframes/node_modules/@img/sharp-libvips-darwin-arm64/
```

The sidecar build owns the remaining JavaScript/Remotion dependencies. Keep
the exact lockfile and package versions used to produce the sidecar alongside
the release evidence.

## Build command

From the extracted source root on the Linux release server or any CI host with
Node, `file`, and `zip` (the script has a permission-preserving Python ZIP
fallback):

```bash
RUNTIME_INPUT=/absolute/path/to/native-mac-runtime-inputs

uname -s
uname -m
node -p 'process.platform + " " + process.arch'
npm --workspace apps/worker-app run runtime:release:mac -- --help
npm --workspace apps/worker-app run runtime:release:mac -- \
  --runtime-version 2026.08.30.1 \
  --hyperframes-sidecar "$RUNTIME_INPUT/sidecars/hyperframes-render" \
  --node-dir "$RUNTIME_INPUT/node" \
  --hyperframes-dir "$RUNTIME_INPUT/hyperframes" \
  --hyperframes-sidecar-script "$RUNTIME_INPUT/hyperframes-sidecar/render.mjs" \
  --remotion-sidecar-script "$RUNTIME_INPUT/remotion-sidecar/render.mjs" \
  --remotion-sidecar-dir "$RUNTIME_INPUT/remotion-sidecar" \
  --browser-dir "$RUNTIME_INPUT/browser" \
  --ffmpeg "$RUNTIME_INPUT/bin/ffmpeg" \
  --ffprobe "$RUNTIME_INPUT/bin/ffprobe" \
  --whisper-cli "$RUNTIME_INPUT/whisper/whisper-cli" \
  --whisper-model "$RUNTIME_INPUT/whisper/.cache/hyperframes/whisper/models/ggml-large-v3.bin" \
  --thai-fonts-dir "$RUNTIME_INPUT/fonts" \
  --notices "$RUNTIME_INPUT/THIRD_PARTY_NOTICES.txt" \
  --signature-file "$RUNTIME_INPUT/SHA256SUMS.sig"
```

The Mac wrapper automatically selects `hyperframes-macos-arm64` and rejects
other targets. It does not require macOS and it never invokes WSL2. Read the
command's `--help` output for any additional source/runtime directory options
in the current release.

## Required archive layout

The generated ZIP must contain at least:

```text
manifest.json
SHA256SUMS
SHA256SUMS.sig
runtime-pack/node/bin/node
runtime-pack/bin/ffmpeg
runtime-pack/bin/ffprobe
runtime-pack/bin/*.dylib
runtime-pack/whisper/whisper-cli
runtime-pack/whisper/lib/libwhisper.1.dylib
runtime-pack/whisper/lib/libggml.0.dylib
runtime-pack/whisper/lib/libggml-base.0.dylib
runtime-pack/whisper/lib/libomp.dylib
runtime-pack/browser/<chrome executable>
runtime-pack/browser/<headless shell executable>
runtime-pack/hyperframes/node_modules/sharp/...
runtime-pack/hyperframes/node_modules/@img/sharp-darwin-arm64/...
runtime-pack/hyperframes/node_modules/@img/sharp-libvips-darwin-arm64/...
runtime-pack/remotion-sidecar/node_modules/@remotion/compositor-darwin-arm64/remotion
runtime-pack/remotion-sidecar/node_modules/@remotion/compositor-darwin-arm64/ffmpeg
runtime-pack/remotion-sidecar/node_modules/@remotion/compositor-darwin-arm64/ffprobe
runtime-pack/remotion-sidecar/node_modules/@esbuild/darwin-arm64/bin/esbuild
runtime-pack/remotion-sidecar/node_modules/@rspack/binding-darwin-arm64/rspack.darwin-arm64.node
sidecars/hyperframes-render
```

`SHA256SUMS.sig` must be produced by the release signing process. A placeholder
signature is not acceptable for a production release. Keep the private key
outside the repository and verify the signature using the server's configured
public key before publishing.

## Native verification before publishing

Use `file` against every native executable. This check works on Linux because
it reads the file format; it does not run the binary:

```bash
file runtime-pack/node/bin/node
file runtime-pack/bin/ffmpeg runtime-pack/bin/ffprobe runtime-pack/bin/*.dylib
file runtime-pack/whisper/whisper-cli runtime-pack/whisper/lib/*.dylib
file runtime-pack/browser/*
file sidecars/hyperframes-render
```

Every native executable must say Mach-O and arm64. The approved Mac sidecar
may instead be the portable POSIX launcher in
`apps/worker-app/sidecars/hyperframes-render`, which delegates to the bundled
Mac Node binary. Check permissions and, on an Apple Silicon Mac or trusted
macOS CI runner, smoke-run the binaries:

```bash
chmod +x runtime-pack/node/bin/node runtime-pack/bin/ffmpeg runtime-pack/bin/ffprobe sidecars/hyperframes-render
runtime-pack/node/bin/node --version
runtime-pack/bin/ffmpeg -version
runtime-pack/bin/ffprobe -version
```

Inspect the generated `manifest.json` and confirm the runtime id, platform,
architecture, sidecar path, archive SHA-256, and file list. Compare the final
ZIP SHA-256 with the value published by the server manifest.

## Signing boundary

The runtime pack is an application release input, not a WSL distribution. ZIP
assembly on Linux does not sign or execute the files. The native executables
and the containing Worker App must be signed and Gatekeeper-tested on macOS.
If the sidecar vendor supplies an already signed binary, preserve its
signature until the final app signing step and record the verification result.

Do not include Apple certificates, private keys, notarization credentials, or
Keychain exports in the ZIP.

## Failure policy

Stop the release if any check reports:

- `hyperframes-wsl2` or `hyperframes-windows-x64`
- `.exe`, `wsl.exe`, Linux ELF, or x86_64-only binaries
- missing Darwin arm64 Sharp/libvips
- missing Darwin arm64 Remotion compositor, esbuild, or rspack modules
- missing Darwin arm64 Whisper or FFmpeg dylib dependencies
- missing approved sidecar launcher, Chrome, FFmpeg, or FFprobe
- missing/invalid manifest or checksum/signature
- a runtime URL/filename that does not match the generated manifest

The correct fix is to rebuild the missing native input on Apple Silicon, not
to bypass the guard or rename another platform's archive.
