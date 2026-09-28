# Remotion Executor Platform Release

A release is a platform-specific signed archive that also contains the compiled
executor CLI under `runtime-pack/executor/dist/`. Build and verify it on the
same target architecture, then promote it atomically to the server release
directory. The builder writes an executor-specific internal
`runtime-pack/manifest.json` (it does not reuse the HyperFrames manifest),
including platform paths, the sidecar checksum, and
`remotionPlatformContractVersion`. The archive must contain the complete Node,
Chromium, FFmpeg/ffprobe, fonts, sidecar, and executor CLI assets.

Required environment variables:

- `REMOTION_EXECUTOR_RUNTIME_ID`: `remotion-executor-windows-x64`,
  `remotion-executor-macos-arm64`, or `remotion-executor-macos-x64`.
- `REMOTION_EXECUTOR_VERSION`.
- `SMARTAIHUB_RUNTIME_PACK_SIGNING_PRIVATE_KEY` for build.
- `SMARTAIHUB_RUNTIME_PACK_PUBLIC_KEY` for verification.

The same public key must be configured on the production web server as
`SMARTAIHUB_RUNTIME_PACK_PUBLIC_KEY`. The runtime-pack manifest and download
routes fail closed unless the archive hash, Ed25519 signature, platform paths,
and actual ZIP contents all verify against this key.

Commands:

```text
npm --workspace @smartspec/remotion-executor run build
npm --workspace @smartspec/remotion-executor run release:pack -- --target <runtime-id> --version <version>
npm --workspace @smartspec/remotion-executor run release:verify -- <archive.zip>
npm --workspace @smartspec/remotion-executor run release:promote -- <archive.zip>
npm --workspace @smartspec/remotion-executor run release:rollback -- <release/archive.zip>
```

For a Windows pack, the pack root can be the existing Remotion runtime source
directory (it must be named `runtime-pack`):

```text
npm --workspace @smartspec/remotion-executor run release:pack -- \
  --target remotion-executor-windows-x64 \
  --version <version> \
  --pack-root apps/worker-app/runtime-pack \
  --output-dir apps/web/client/public/releases/runtime
```

macOS arm64/x64 must be built from a native macOS runtime root containing the
matching Chromium, Node, FFmpeg/ffprobe, fonts, and sidecar binaries; the
Windows runtime root must never be reused for macOS. After promotion, deploy
the archive and `.manifest.json` together and verify each public manifest URL
returns `200` before enabling the tenant feature flag.

Promotion keeps the previous archive and manifest. Rollback restores those
files atomically; it does not delete user credentials, jobs, or media. The
source installers refuse to run until the release pipeline embeds the pinned
Ed25519 public key; this prevents an operator from accidentally distributing an
unsigned bootstrap. The tenant feature flag remains off until Windows 11 and macOS native preview
render, checksum publication, ACL download, and restart/reconnect evidence are
recorded.
