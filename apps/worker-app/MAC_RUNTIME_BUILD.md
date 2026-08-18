# Native macOS HyperFrames runtime pack

This manual builds the runtime archive consumed by the macOS Worker App. It is
not the Hermes runtime. It is also not interchangeable with the Windows/WSL2
runtime.

## Required identity

Every output must use exactly:

```text
runtimeId: hyperframes-macos-arm64
runtimePlatform: macos-arm64
architecture: arm64
```

The packager refuses Linux, WSL, Windows, Intel Mac, `.exe`, and non-Mach-O
native binaries. Run it on a native Apple Silicon Mac with Node running as
arm64.

## Inputs

Provide native arm64 versions of all of these:

```text
sidecarPath       HyperFrames/Remotion native render sidecar
nodePath          Node 22+ executable
chromePath        Chrome for Testing or Google Chrome executable
headlessShellPath Chromium headless shell executable
ffmpegPath        FFmpeg executable
ffprobePath       FFprobe executable
```

The runtime Node tree must contain the production dependencies used by the
sidecar, including the Darwin arm64 Sharp/libvips packages:

```text
runtime-pack/node/bin/node
runtime-pack/node/node_modules/sharp/
runtime-pack/node/node_modules/@img/sharp-darwin-arm64/
runtime-pack/node/node_modules/@img/sharp-libvips-darwin-arm64/
```

The sidecar build owns the remaining JavaScript/Remotion dependencies. Keep
the exact lockfile and package versions used to produce the sidecar alongside
the release evidence.

## Build command

From the extracted source root:

```bash
RUNTIME_INPUT=/absolute/path/to/native-mac-runtime-inputs

uname -s
uname -m
node -p 'process.platform + " " + process.arch'
npm --workspace apps/worker-app run runtime:release:mac -- --help
npm --workspace apps/worker-app run runtime:release:mac -- \
  --runtime-version 2026.08.18.1 \
  --hyperframes-sidecar "$RUNTIME_INPUT/sidecars/hyperframes-render" \
  --node-dir "$RUNTIME_INPUT/node" \
  --hyperframes-dir "$RUNTIME_INPUT/hyperframes" \
  --hyperframes-sidecar-script "$RUNTIME_INPUT/hyperframes-sidecar/render.mjs" \
  --remotion-sidecar-script "$RUNTIME_INPUT/remotion-sidecar/render.mjs" \
  --remotion-sidecar-dir "$RUNTIME_INPUT/remotion-sidecar" \
  --browser-dir "$RUNTIME_INPUT/browser" \
  --ffmpeg "$RUNTIME_INPUT/bin/ffmpeg" \
  --ffprobe "$RUNTIME_INPUT/bin/ffprobe" \
  --thai-fonts-dir "$RUNTIME_INPUT/fonts" \
  --notices "$RUNTIME_INPUT/THIRD_PARTY_NOTICES.txt" \
  --signature-file "$RUNTIME_INPUT/SHA256SUMS.sig"
```

The command must be run without `--target hyperframes-wsl2`; the Mac wrapper
rejects that target. Read the command's `--help` output for any additional
source/runtime directory options in the current release.

## Required archive layout

The generated ZIP must contain at least:

```text
manifest.json
SHA256SUMS
SHA256SUMS.sig
runtime-pack/node/bin/node
runtime-pack/bin/ffmpeg
runtime-pack/bin/ffprobe
runtime-pack/browser/<chrome executable>
runtime-pack/browser/<headless shell executable>
runtime-pack/node/node_modules/sharp/...
runtime-pack/node/node_modules/@img/sharp-darwin-arm64/...
runtime-pack/node/node_modules/@img/sharp-libvips-darwin-arm64/...
sidecars/hyperframes-render
```

`SHA256SUMS.sig` must be produced by the release signing process. A placeholder
signature is not acceptable for a production release. Keep the private key
outside the repository and verify the signature using the server's configured
public key before publishing.

## Native verification before publishing

Use `file` against every native executable:

```bash
file runtime-pack/node/bin/node
file runtime-pack/bin/ffmpeg runtime-pack/bin/ffprobe
file runtime-pack/browser/*
file sidecars/hyperframes-render
```

Every executable must say Mach-O and arm64. Check permissions and smoke-run
the binaries:

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

The runtime pack is an application release input, not a WSL distribution. The
native executables and the containing Worker App must be signed on macOS. If
the sidecar vendor supplies an already signed binary, preserve its signature
until the final app signing step and record the verification result.

Do not include Apple certificates, private keys, notarization credentials, or
Keychain exports in the ZIP.

## Failure policy

Stop the release if any check reports:

- `hyperframes-wsl2` or `hyperframes-windows-x64`
- `.exe`, `wsl.exe`, Linux ELF, or x86_64-only binaries
- missing Darwin arm64 Sharp/libvips
- missing native sidecar, Chrome, FFmpeg, or FFprobe
- missing/invalid manifest or checksum/signature
- a runtime URL/filename that does not match the generated manifest

The correct fix is to rebuild the missing native input on Apple Silicon, not
to bypass the guard or rename another platform's archive.
