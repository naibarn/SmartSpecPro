# Remotion Executor Platform Release

A release is a platform-specific signed archive. Build and verify it on the
same target architecture, then promote it atomically to the server release
directory. The archive must contain `remotion-sidecar/render.mjs` and a valid
`runtime-pack/manifest.json`.

Required environment variables:

- `REMOTION_EXECUTOR_RUNTIME_ID`: `remotion-executor-windows-x64`,
  `remotion-executor-macos-arm64`, or `remotion-executor-macos-x64`.
- `REMOTION_EXECUTOR_VERSION`.
- `SMARTAIHUB_RUNTIME_PACK_SIGNING_PRIVATE_KEY` for build.
- `SMARTAIHUB_RUNTIME_PACK_PUBLIC_KEY` for verification.

Commands:

```text
npm --workspace @smartspec/remotion-executor run release:pack
npm --workspace @smartspec/remotion-executor run release:verify -- <archive.zip>
npm --workspace @smartspec/remotion-executor run release:promote -- <archive.zip>
npm --workspace @smartspec/remotion-executor run release:rollback -- <release/archive.zip>
```

Promotion keeps the previous archive and manifest. Rollback restores those
files atomically; it does not delete user credentials, jobs, or media. The
tenant feature flag remains off until Windows 11 and macOS native preview
render, checksum publication, ACL download, and restart/reconnect evidence are
recorded.
