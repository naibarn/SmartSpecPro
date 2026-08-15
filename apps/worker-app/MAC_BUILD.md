# Smart AI Hub Worker App — macOS source bundle

This archive is the current Worker App source snapshot for continuing macOS
build work on a Mac. It is not a finished macOS installer and it does not ship
the Linux/WSL2 or Windows runtime binaries.

## Prepare the Mac

1. Use macOS with Xcode and the Xcode Command Line Tools installed.
2. Install Node.js `22.22.3` and Rust with the Apple target needed by the Mac:
   `aarch64-apple-darwin` for Apple Silicon or `x86_64-apple-darwin` for Intel.
3. From the extracted repository root, install the workspace dependencies:

   ```bash
   npm install --legacy-peer-deps
   ```

4. Verify the source and native test suite:

   ```bash
   npm run typecheck --workspace @smartspec/worker-app
   npm run test --workspace @smartspec/worker-app
   ```

## Remaining macOS work

Before producing a usable Mac Worker, the source still needs a native macOS
runtime pack and sidecar (Node, Chromium, FFmpeg/ffprobe, fonts, and the
HyperFrames renderer), a macOS runtime mode instead of Managed WSL, Tauri
`app/dmg` bundle configuration, and a Mac release/signing workflow. The
existing Windows/WSL2 runtime pack is intentionally excluded from this ZIP and
must not be copied into a Mac release.

After those pieces are implemented, build the Mac bundle from the extracted
root with the project-specific Mac release command and sign/notarize it on the
Mac or a trusted macOS CI runner.
