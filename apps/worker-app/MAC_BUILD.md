# Smart AI Hub Worker App — macOS build and release manual

This source bundle is the complete source hand-off for building the native
Worker App on an Apple Silicon Mac. It is not a ready-made DMG. The build must
be performed on macOS (or a trusted macOS CI runner) because the Worker App
contains native Rust/Tauri code and the HyperFrames render runtime contains
Mach-O, arm64, Chromium, FFmpeg, Node, native Sharp/libvips, and a native
render sidecar.

## Non-negotiable platform rule

The macOS Worker App uses **only** the native runtime id
`hyperframes-macos-arm64`.

Do not use, copy, unpack, or point a Mac installation at any of these:

- `hyperframes-wsl2`
- `hyperframes-windows-x64`
- `.exe` sidecars or Windows installers
- `wsl.exe`, WSL2, Ubuntu-on-WSL, `/mnt/c`, or a Linux runtime directory

The app and runtime packager fail closed when a Mac is given a WSL2/Windows
runtime. Hermes is a separate subsystem and its runtime is not a substitute
for the HyperFrames render runtime.

## Supported target

- macOS 13 Ventura or newer
- Apple Silicon (`arm64`, `aarch64-apple-darwin`): M1, M2, M3, M4 or newer
- Intel Macs are not supported by this release. An Intel build needs a
  separately produced `x86_64-apple-darwin` runtime and is intentionally not
  accepted by this package.

## Programs and accounts required on the Mac

Install these before building:

1. Xcode from the Mac App Store, then open it once and accept the license.
2. Xcode Command Line Tools:

   ```bash
   xcode-select --install
   xcodebuild -license
   ```

3. Homebrew (Apple Silicon) and the command-line tools used by the scripts:

   ```bash
   brew install node@22 python@3.12 rustup-init
   ```

   Ensure the `arm64` Homebrew and Node are first on `PATH`. Do not install or
   invoke Linux packages through WSL.
4. Rust and the native Tauri target:

   ```bash
   rustup-init
   source "$HOME/.cargo/env"
   rustup target add aarch64-apple-darwin
   rustc -vV
   ```

5. A Git client and `npm`. Use the Node version declared by the project
   (`22.22.3`) and the repository's npm lockfile.
6. For a distributable release: an Apple Developer account, a team, a
   `Developer ID Application` certificate, and notarization credentials. The
   private signing key must remain on the Mac/CI runner and must never be put
   into this source ZIP or a runtime ZIP.

Useful verification commands:

```bash
uname -s
uname -m
node -p 'process.platform + " " + process.arch'
xcode-select -p
rustup target list --installed
```

Expected values are `Darwin`, `arm64`, `darwin arm64`, a valid Xcode path, and
`aarch64-apple-darwin`. If any check reports Linux, WSL, `x86_64`, or a
Windows path, stop and move the build to an Apple Silicon Mac.

## Install and verify the source

From the extracted directory containing the root `package.json`:

```bash
npm install --legacy-peer-deps
npm --workspace @smartspec/remotion-render run build
npm run typecheck --workspace @smartspec/worker-app
npm run test --workspace @smartspec/worker-app
npm --workspace apps/worker-app run build
```

Do not copy `node_modules`, `target`, `dist`, a Windows installer, or a WSL2
runtime from another machine into this source tree. The source download
intentionally excludes generated binaries and secrets.

## Build the native HyperFrames runtime

The native runtime is a separate release artifact. Read
`MAC_RUNTIME_BUILD.md` completely before assembling it. The packager refuses
to run unless the host is macOS arm64 and all required native files are
Mach-O arm64.

Typical command:

```bash
RUNTIME_INPUT=/absolute/path/to/native-mac-runtime-inputs

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

The exact option names are printed by `--help`. The command must produce a
manifest whose runtime id is `hyperframes-macos-arm64`. Never rename a WSL2
archive to make it look like a Mac archive.

The native sidecar must be supplied by the HyperFrames/Remotion build process
or built from the approved source on macOS. If it is absent, stop: the script
must fail rather than silently packaging a Linux or Windows executable.

## Build the Tauri application and DMG

After the native runtime has been staged and verified:

```bash
npm --workspace apps/worker-app run tauri:build -- \
  --target aarch64-apple-darwin \
  --bundles app,dmg
```

The expected output contains an arm64 `.app` and `.dmg` under
`apps/worker-app/src-tauri/target/aarch64-apple-darwin/release/bundle/`.
The application bundle must contain the native runtime pack and must not
contain `.exe`, `wsl.exe`, `hyperframes-wsl2`, or a Linux ELF executable.

## Sign, verify, notarize, and staple

Use a `Developer ID Application` identity for distribution outside the Mac App
Store. Replace the identity and paths below with the actual release values:

```bash
security find-identity -v -p codesigning

codesign --deep --force --options runtime --timestamp \
  --sign "Developer ID Application: YOUR COMPANY (TEAMID)" \
  apps/worker-app/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Smart\ AI\ Hub\ Worker.app

codesign --verify --deep --strict --verbose=2 \
  apps/worker-app/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Smart\ AI\ Hub\ Worker.app
spctl --assess --type execute --verbose=4 \
  apps/worker-app/src-tauri/target/aarch64-apple-darwin/release/bundle/macos/Smart\ AI\ Hub\ Worker.app
```

For notarization, store credentials in the macOS Keychain or use an approved
CI secret provider. Do not put an Apple password or API private key in the
source bundle:

```bash
xcrun notarytool store-credentials smartaihub-notary \
  --apple-id "YOUR_APPLE_ID" \
  --team-id "TEAMID" \
  --password "APP_SPECIFIC_PASSWORD"

xcrun notarytool submit \
  "apps/worker-app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Smart AI Hub Worker.dmg" \
  --keychain-profile smartaihub-notary --wait

xcrun stapler staple \
  "apps/worker-app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Smart AI Hub Worker.dmg"
xcrun stapler validate \
  "apps/worker-app/src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/Smart AI Hub Worker.dmg"
```

Run `codesign`, `spctl`, and `stapler` against the final artifact after every
change. A successful local build is not proof that Gatekeeper or notarization
will accept the download.

## Publish and install checks

Before uploading a release:

```bash
shasum -a 256 "Smart AI Hub Worker.dmg"
unzip -l smart-ai-hub-worker-app-macos-source-*.zip
```

Test on a clean Apple Silicon Mac with no development checkout present:

1. Install the signed/notarized DMG.
2. Start the app and confirm the Runtime doctor reports
   `hyperframes-macos-arm64`.
3. Run the native runtime checks and a small Remotion render.
4. Confirm Hermes still reports its own runtime independently.
5. Confirm the app never offers Managed WSL or a WSL2 setup action.
6. Confirm a runtime update downloads the Mac archive and rejects a Windows or
   WSL2 archive with a clear error.
7. Confirm a failed render includes the actual missing native file/path in the
   doctor output and does not silently fall back to another platform.

## Troubleshooting

### `macOS Worker App only supports ... hyperframes-macos-arm64`

The settings file was copied from Windows or contains a legacy WSL setting.
Close the app, remove the old Worker App settings file from its macOS
Application Support directory, reopen the native app, and install the Mac
runtime through the app's runtime action. Do not edit the runtime id to a WSL2
value.

### `runtime packager requires macOS arm64`

The command is running on Linux, WSL, an Intel Mac, or under an x86 Node/Rust
toolchain. Verify `uname -m` and `node -p process.arch`; then rerun on a native
Apple Silicon environment.

### `not a Mach-O arm64 executable`

One of Node, Chrome, headless shell, FFmpeg, ffprobe, or the sidecar came from
Linux, Windows, Rosetta/x86, or a stale build directory. Replace that file
with a native arm64 build and run the runtime packager again.

### Sharp/libvips failure

The runtime needs the Darwin arm64 Sharp packages and native libvips binding.
Run `npm install --legacy-peer-deps` on the Mac, inspect the `sharp` and
`@img/sharp-*-darwin-arm64` files in `runtime-pack/node/node_modules`, and
rebuild the runtime staging directory. Never copy the Linux `@img` package.

### Chrome or FFmpeg starts locally but the app fails

Check executable permissions, the exact manifest path, and the signed app's
embedded runtime path. Run the doctor again and inspect its path/error details.
On a hardened release, sign every nested executable before signing the outer
`.app` and verify with `codesign --verify --deep --strict`.

### Gatekeeper says the app is damaged or unidentified

The app/DMG was not signed with the correct Developer ID identity, was changed
after signing, or was not notarized/stapled. Rebuild, sign nested binaries,
sign the app, submit the final DMG, staple the ticket, and validate again.

### Server returns 404 for a Mac runtime

The archive must be published under the server's official runtime release
directory with the exact filename generated by the packager and a matching
manifest. Check the manifest endpoint from Dashboard and compare its SHA-256
with the downloaded file. Do not upload a manually renamed WSL2 archive.

## What cannot be included in this ZIP

This source bundle cannot contain the Mac host's Xcode SDK, Apple signing
identity/private key, notarization ticket, Keychain credentials, or a native
sidecar that is not legally/technically distributable from this repository.
Those are external release inputs and must be supplied on the Mac or trusted
macOS CI. Everything that can safely be versioned for the build is included:
the Tauri source/configuration, platform guardrails, runtime packager,
entitlements, tests, and both this manual and `MAC_RUNTIME_BUILD.md`.

## Official release references

- Tauri macOS application bundles: https://v2.tauri.app/distribute/macos-application-bundle/
- Tauri DMG bundles: https://v2.tauri.app/distribute/dmg/
- Apple Developer ID: https://developer.apple.com/developer-id/
- Apple notarization: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
