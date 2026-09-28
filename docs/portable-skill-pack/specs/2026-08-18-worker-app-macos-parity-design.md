# Worker App macOS parity and native runtime design

## Goal

Prepare the Worker App source and release contracts so an Apple Silicon Mac can
be built externally with Xcode, signed, notarized, and run the same Worker,
HyperFrames, and Remotion render lanes as Windows. This repository does not
build or sign the macOS app; the Mac host is the authoritative build surface.

## Platform boundary

The runtime family is selected from the compiled host platform, never from a
Windows/WSL preference on macOS:

| Host | HyperFrames runtime | Hermes runtime |
| --- | --- | --- |
| Windows x64 with managed Linux renderer | `hyperframes-wsl2` | `hermes-windows-x64` |
| Windows x64 native renderer | `hyperframes-windows-x64` | `hermes-windows-x64` |
| macOS Apple Silicon | `hyperframes-macos-arm64` | `hermes-macos-arm64` |

Intel macOS is explicitly denied for the first native Mac runtime. A Mac build
must never select, download, install, or execute `hyperframes-wsl2`, Linux
browser binaries, Windows `.exe` sidecars, or WSL setup commands.

## Source and build contract

- Tauri enables macOS `app` and `dmg` targets while retaining Windows targets.
- macOS settings normalize to native `runtime_pack` and `useWsl2: false`,
  including old settings files restored from a Windows copy.
- The Mac source archive includes the complete build and runtime manuals,
  native runtime packager, parity checks, and source-side native launcher
  inputs, while excluding generated binaries, secrets, and Linux/Windows
  runtime packs.
- `MAC_BUILD.md` documents Xcode, command line tools, Node, Rust targets,
  native dependencies, code signing, entitlements, notarization, release
  verification, and troubleshooting.

## Native macOS runtime contract

`package-macos-runtime.mjs` runs only on macOS arm64 and accepts native paths
for Node, Chrome for Testing, FFmpeg/ffprobe, HyperFrames sidecar, HyperFrames
dependencies, Remotion sidecar dependencies, Thai fonts, notices, and the
checksum/signature inputs. It writes a separate archive with:

- `runtimeId: hyperframes-macos-arm64`
- `runtimePlatform: macos-arm64`
- native `bin/node`, `bin/ffmpeg`, `bin/ffprobe`
- native Chrome under `runtime-pack/browser`
- HyperFrames CLI and macOS sidecar
- Remotion sidecar and installed `@smartspec/remotion-render` parity
- manifest, checksums, signature, license notices, and archive metadata

The packager rejects WSL/Linux/Windows markers, non-Mach-O executables, Intel
architecture, mock sidecars, missing native modules, and version drift. The
server release route and Worker App installer accept only the matching Mac
runtime id on macOS.

## Dashboard/manual contract

The Mac Worker card keeps the source and runtime downloads separate and adds a
full manual link to `/docs/worker-app-macos-build`. The page explains what is
included, what cannot be built on Linux, exact Mac commands, signing and
notarization prerequisites, runtime assembly, first-run verification, and
failure recovery. The source ZIP carries the same manual in `MAC_BUILD.md` and
the native runtime procedure in `MAC_RUNTIME_BUILD.md`.

## Failure handling and verification

- Fail closed when platform/runtime ids disagree.
- Never silently fall back from native macOS runtime to WSL2 or Windows.
- Keep Hermes and HyperFrames/Remotion runtime manifests independent.
- Verify source archive exclusions, runtime archive entries, native binary
  architecture, sidecar/package/manifest parity, and route/UI links.
- Verify on this Linux host only through source checks, script dry runs,
  manifests, and static tests. Actual Xcode build, codesign, notarization,
  native Mac execution, and production download are explicitly external checks
  for the Mac operator/CI handoff.
