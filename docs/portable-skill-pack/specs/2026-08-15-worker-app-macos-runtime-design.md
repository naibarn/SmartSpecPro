# Worker App macOS runtime pack

## Decision

Publish a separate Hermes runtime archive for `hermes-macos-arm64`. The
Windows runtime id, archive, version, and install path remain independent and
are not rebuilt as part of this release.

## Supported hardware

The first macOS pack targets `aarch64-apple-darwin` and supports Macs with
Apple M1, M2, M3, or M4 chips: MacBook Air/Pro, Mac mini, iMac, Mac Studio,
and Mac Pro models carrying those chips. Intel Macs (`x86_64`) are explicitly
unsupported and are shown as such in the Dashboard.

## Assembly contract

The server-side builder downloads the native `python-build-standalone`
`aarch64-apple-darwin` Python 3.11 archive, resolves `hermes-agent==0.18.2`
with `uv` for the Apple target and writes a native launcher that invokes
`hermes_cli` through the bundled interpreter. A Mac pack is marked allowed
only after this branch completes and the archive SHA-256/size sidecar is
written.

## Update and download contract

The public runtime manifest endpoint serves the Mac id independently of the
HyperFrames/Windows ids. The Worker App selects the Mac id on macOS, refuses a
denied manifest, downloads the matching archive, verifies its archive digest,
and installs it under the Mac Hermes runtime directory. The Dashboard displays
the live manifest status and a download action only when the Mac pack is
allowed.

This pack is the Hermes media-worker runtime. It is not the Remotion render
runtime/sidecar and does not replace or modify the Windows/WSL2 render runtime.
Any future native Remotion Mac render pack must use a separate explicit runtime
id and packaging branch.
